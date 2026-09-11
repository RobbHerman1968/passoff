import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { db } from "@/db";
import { clientProjects } from "@/db/schema";
import { getFigmaImport, saveFigmaImport } from "@/lib/figma/persistence";
import { normalizeInspectTree, type InspectNode } from "@/lib/figma/inspect";
import { verifyProjectPluginKey } from "@/lib/figma/plugin-key";
import type { FigmaImportResult, FigmaInteraction } from "@/lib/figma/types";
import { getServiceTenantContextForProjectKey } from "@/lib/tenant/context";

export const runtime = "nodejs";

const allowedOrigins = new Set(["null", "https://www.figma.com", "https://figma.com"]);

type RestNode = {
  id?: string; name?: string; type?: string; children?: RestNode[];
  absoluteBoundingBox?: { x?: number; y?: number; width?: number; height?: number };
  interactions?: Array<{ trigger?: { type?: string }; actions?: Array<{ type?: string; navigation?: string; destinationId?: string }> }>;
};
type PluginFrame = { id?: unknown; name?: unknown; type?: unknown; x?: unknown; y?: unknown; width?: unknown; height?: unknown; restJson?: unknown; pngBase64?: unknown };
type PluginPayload = {
  file?: { key?: unknown; name?: unknown; pageName?: unknown };
  frames?: unknown;
  mode?: unknown;
  pluginKey?: unknown;
  projectKey?: unknown;
};

function originHeaders(request: Request) {
  const origin = request.headers.get("origin") || "null";
  if (!allowedOrigins.has(origin)) return null;
  return { "Access-Control-Allow-Origin": origin, "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type, X-Passoff-Plugin-Key", "Cache-Control": "no-store", Vary: "Origin" };
}

function finiteNumber(value: unknown): value is number { return typeof value === "number" && Number.isFinite(value); }
function restDocument(value: unknown): RestNode | null { if (!value || typeof value !== "object") return null; const document = (value as { document?: unknown }).document; return document && typeof document === "object" ? document as RestNode : null; }
function json(request: Request, error: string, status: number) { return NextResponse.json({ error }, { status, headers: originHeaders(request) || { "Cache-Control": "no-store" } }); }
function errorWithCause(error: unknown) {
  const messages: string[] = [];
  let current: unknown = error;
  while (current instanceof Error) {
    if (!messages.includes(current.message)) messages.push(current.message);
    current = current.cause;
  }
  return messages.join(": ") || "Unable to save the Figma plugin export.";
}

export async function OPTIONS(request: Request) {
  const headers = originHeaders(request);
  return headers ? new Response(null, { status: 204, headers }) : new Response(null, { status: 403 });
}

export async function POST(request: Request) {
  if (process.env.NODE_ENV !== "development") return json(request, "The local Figma plugin import route is disabled outside development.", 404);
  if (!originHeaders(request)) return json(request, "This origin is not allowed to import Figma data.", 403);
  if (!(request.headers.get("content-type") || "").includes("application/json")) return json(request, "Expected a JSON plugin export.", 415);
  try {
    const payload = await request.json() as PluginPayload;
    let tenant;
    try {
      tenant = await getServiceTenantContextForProjectKey(payload.projectKey);
    } catch (error) {
      return json(request, error instanceof Error ? error.message : "A valid Pass-Off project key is required.", 400);
    }
    const project = (
      await db
        .select({ keyHash: clientProjects.figmaPluginKeyHash })
        .from(clientProjects)
        .where(and(
          eq(clientProjects.id, tenant.projectId),
          eq(clientProjects.organizationId, tenant.organizationId),
          eq(clientProjects.workspaceId, tenant.workspaceId),
        ))
        .limit(1)
    )[0];
    const suppliedKey = request.headers.get("x-passoff-plugin-key") || payload.pluginKey;
    if (!verifyProjectPluginKey(suppliedKey, project?.keyHash)) {
      return json(request, "The plugin key is missing, invalid, or belongs to another project. Copy this project’s plugin key from Pass-Off.", 401);
    }
    if (!payload.file || typeof payload.file !== "object") return json(request, "The plugin export is missing file metadata. Reload the local plugin from manifest and try again.", 400);
    if (typeof payload.file.key !== "string" || !/^[A-Za-z0-9_-]+$/.test(payload.file.key)) return json(request, "The plugin export has an invalid Figma file key. Open a cloud Figma file or reload the plugin so it can synthesize a local key.", 400);
    if (typeof payload.file.name !== "string" || !payload.file.name.trim()) return json(request, "The plugin export is missing the Figma file name.", 400);
    if (!Array.isArray(payload.frames)) return json(request, "The plugin export is missing a frames array.", 400);
    if (payload.frames.length < 1) return json(request, "The plugin export did not include any frames. Select a frame, component, or section and export again.", 400);
    if (payload.frames.length > 100) return json(request, "Each plugin export batch can include at most 100 frames.", 400);
    const mode = payload.mode === "append" ? "append" : "replace";
    const frames = payload.frames as PluginFrame[];
    let totalPreviewCharacters = 0;
    for (const frame of frames) {
      if (typeof frame.id !== "string" || typeof frame.name !== "string" || typeof frame.type !== "string" || !finiteNumber(frame.x) || !finiteNumber(frame.y) || !finiteNumber(frame.width) || !finiteNumber(frame.height) || !restDocument(frame.restJson) || typeof frame.pngBase64 !== "string" || !/^[A-Za-z0-9+/=]+$/.test(frame.pngBase64)) return json(request, "One or more exported frames are invalid.", 400);
      if (frame.pngBase64.length > 8_000_000) return json(request, `The preview for ${frame.name} is too large. Reduce the frame size and try again.`, 413);
      totalPreviewCharacters += frame.pngBase64.length;
    }
    if (totalPreviewCharacters > 40_000_000) return json(request, "This export batch exceeds the 40 MB development import limit. The plugin will retry with smaller batches.", 413);

    const ownerByNode = new Map<string, string>();
    function registerOwners(node: RestNode, screenId: string) { if (node.id) ownerByNode.set(node.id, screenId); for (const child of node.children ?? []) registerOwners(child, screenId); }
    for (const frame of frames) registerOwners(restDocument(frame.restJson)!, frame.id as string);
    const interactions: FigmaInteraction[] = [];
    function collectInteractions(node: RestNode, screenId: string) {
      for (const interaction of node.interactions ?? []) {
        const actions = interaction.actions ?? [];
        const destinationNodeId = actions.find((action) => action.destinationId)?.destinationId ?? null;
        const bounds = node.absoluteBoundingBox;
        interactions.push({ sourceNodeId: node.id || screenId, sourceNodeName: node.name || node.type || "Unnamed node", sourceScreenId: screenId, destinationNodeId, destinationScreenId: destinationNodeId ? ownerByNode.get(destinationNodeId) || destinationNodeId : null, trigger: interaction.trigger?.type || "UNKNOWN", actions: actions.map((action) => action.navigation || action.type || "UNKNOWN"), sourceBounds: bounds && finiteNumber(bounds.x) && finiteNumber(bounds.y) && finiteNumber(bounds.width) && finiteNumber(bounds.height) ? { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height } : null });
      }
      for (const child of node.children ?? []) collectInteractions(child, screenId);
    }
    for (const frame of frames) collectInteractions(restDocument(frame.restJson)!, frame.id as string);
    const counts = new Map<string, number>();
    for (const interaction of interactions) counts.set(interaction.sourceScreenId, (counts.get(interaction.sourceScreenId) ?? 0) + 1);
    const inspectTrees: Record<string, InspectNode> = {};
    for (const frame of frames) {
      const tree = normalizeInspectTree(restDocument(frame.restJson));
      if (tree) inspectTrees[frame.id as string] = tree;
    }
    const now = new Date();
    const result: FigmaImportResult = {
      file: { key: payload.file.key, name: payload.file.name.slice(0, 200), version: `plugin-${now.getTime()}`, lastModified: now.toISOString(), thumbnailUrl: `data:image/png;base64,${frames[0].pngBase64 as string}` },
      screens: frames.map((frame) => ({ id: frame.id as string, name: (frame.name as string).slice(0, 200), type: frame.type as string, imageUrl: `data:image/png;base64,${frame.pngBase64 as string}`, width: frame.width as number, height: frame.height as number, x: frame.x as number, y: frame.y as number, interactionCount: counts.get(frame.id as string) ?? 0 })),
      interactions,
      warnings: interactions.length ? [] : ["No prototype interactions were found in the selected frames."],
    };
    const version = await saveFigmaImport(tenant, null, result, { mode, source: "plugin", inspectTrees });
    const saved = await getFigmaImport(tenant, result.file.key);
    return NextResponse.json({
      projectKey: tenant.projectId,
      projectName: tenant.projectName,
      fileKey: result.file.key,
      fileName: result.file.name,
      ...version,
      mode,
      batchScreenCount: result.screens.length,
      batchInteractionCount: interactions.length,
      screenCount: saved?.screens.length ?? result.screens.length,
      previewCount: saved?.screens.filter((screen) => Boolean(screen.imageUrl)).length ?? result.screens.length,
      interactionCount: saved?.interactions.length ?? interactions.length,
    }, { status: 201, headers: originHeaders(request)! });
  } catch (error) {
    return json(request, errorWithCause(error), 400);
  }
}
