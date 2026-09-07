import "server-only";

import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";

import { db } from "@/db";
import { figmaConnections } from "@/db/schema";
import type { FigmaImportProgress, FigmaImportResult, FigmaInteraction, FigmaRateLimitDetails, FigmaScreen } from "./types";
import { decryptToken, encryptToken } from "./crypto";
import { normalizeInspectTree, type InspectNode } from "./inspect";
import { refreshFigmaAccessToken } from "./oauth";

type FigmaNode = {
  id: string;
  name?: string;
  type: string;
  children?: FigmaNode[];
  absoluteBoundingBox?: { x: number; y: number; width: number; height: number };
  layoutMode?: string;
  paddingTop?: number;
  paddingRight?: number;
  paddingBottom?: number;
  paddingLeft?: number;
  itemSpacing?: number;
  cornerRadius?: number;
  rectangleCornerRadii?: number[];
  fills?: Array<{ type?: string; opacity?: number; color?: { r?: number; g?: number; b?: number; a?: number } }>;
  strokes?: Array<{ type?: string; opacity?: number; color?: { r?: number; g?: number; b?: number; a?: number } }>;
  strokeWeight?: number;
  style?: {
    fontFamily?: string;
    fontSize?: number;
    fontWeight?: number;
    lineHeightPx?: number;
    letterSpacing?: number;
  };
  interactions?: Array<{
    trigger?: { type?: string };
    actions?: Array<{ type?: string; destinationId?: string; navigation?: string }>;
  }>;
};

type FigmaFileResponse = {
  name: string;
  version: string;
  lastModified: string;
  thumbnailUrl?: string;
  document: FigmaNode;
};

export class FigmaApiError extends Error {
  constructor(message: string, public readonly status: number, public readonly rateLimit: FigmaRateLimitDetails | null = null) {
    super(message);
    this.name = "FigmaApiError";
  }
}

export function parseFigmaFileUrl(value: string) {
  if (value.length > 2_048) throw new Error("The Figma URL is too long.");
  let url: URL;
  try { url = new URL(value); } catch { throw new Error("Enter a valid Figma file or prototype URL."); }
  if (url.protocol !== "https:" || !["figma.com", "www.figma.com"].includes(url.hostname)) {
    throw new Error("Only https://www.figma.com file and prototype URLs are supported.");
  }
  const match = url.pathname.match(/^\/(?:design|file|proto)\/([^/]+)/);
  if (!match?.[1] || !/^[A-Za-z0-9_-]+$/.test(match[1])) {
    throw new Error("The URL does not contain a valid Figma file key.");
  }
  return { fileKey: match[1], nodeId: url.searchParams.get("node-id")?.replace("-", ":") ?? null };
}

async function getConnection(connectionId: string) {
  const rows = await db.select().from(figmaConnections).where(eq(figmaConnections.id, connectionId)).limit(1);
  return rows[0] ?? null;
}

export async function getConnectionSummary(connectionId: string) {
  const connection = await getConnection(connectionId);
  if (!connection) return null;
  return { figmaUserId: connection.figmaUserId, expiresAt: connection.accessTokenExpiresAt };
}

export async function createConnection(tokens: {
  organizationId: string;
  workspaceId: string;
  connectedByUserId: string;
  figmaUserId: string;
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}) {
  const id = randomUUID();
  await db.insert(figmaConnections).values({
    id,
    organizationId: tokens.organizationId,
    workspaceId: tokens.workspaceId,
    connectedByUserId: tokens.connectedByUserId,
    figmaUserId: tokens.figmaUserId,
    encryptedAccessToken: encryptToken(tokens.accessToken),
    encryptedRefreshToken: encryptToken(tokens.refreshToken),
    accessTokenExpiresAt: new Date(Date.now() + tokens.expiresIn * 1_000),
  });
  return id;
}

export async function deleteConnection(connectionId: string) {
  await db.delete(figmaConnections).where(eq(figmaConnections.id, connectionId));
}

async function validAccessToken(connectionId: string) {
  const connection = await getConnection(connectionId);
  if (!connection) throw new Error("Connect Figma before importing a file.");

  if (connection.accessTokenExpiresAt.getTime() > Date.now() + 5 * 60_000) {
    return decryptToken(connection.encryptedAccessToken);
  }

  const refreshed = await refreshFigmaAccessToken(decryptToken(connection.encryptedRefreshToken));
  await db.update(figmaConnections).set({
    encryptedAccessToken: encryptToken(refreshed.access_token),
    accessTokenExpiresAt: new Date(Date.now() + refreshed.expires_in * 1_000),
    updatedAt: new Date(),
  }).where(eq(figmaConnections.id, connectionId));
  return refreshed.access_token;
}

async function figmaGet<T>(connectionId: string, path: string) {
  const accessToken = await validAccessToken(connectionId);
  const response = await fetch(`https://api.figma.com${path}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
  if (response.status === 429) {
    const rawRetryAfter = response.headers.get("retry-after");
    const parsedRetryAfter = rawRetryAfter ? Number(rawRetryAfter) : Number.NaN;
    const retryAfterSeconds = Number.isFinite(parsedRetryAfter) ? parsedRetryAfter : null;
    const retryAt = retryAfterSeconds === null ? null : new Date(Date.now() + retryAfterSeconds * 1_000).toISOString();
    const planTier = response.headers.get("x-figma-plan-tier");
    const rateLimitType = response.headers.get("x-figma-rate-limit-type");
    const upgradeUrl = response.headers.get("x-figma-upgrade-link");
    const retryDescription = retryAt ? ` Figma says this quota becomes available around ${new Date(retryAt).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Chicago" })}.` : " Try again later.";
    const quotaDescription = rateLimitType === "low" ? " The connected Figma account appears to have a View or Collab seat, whose Tier 1 file access is limited to a small monthly quota." : " The connected account has exhausted its current Tier 1 file API quota.";
    throw new FigmaApiError(`Figma file-import quota reached.${retryDescription}${quotaDescription}`, 429, { retryAfterSeconds, retryAt, planTier, rateLimitType, upgradeUrl });
  }
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { message?: string; error?: string; err?: string } | null;
    const detail = payload?.message || payload?.error || payload?.err;
    throw new FigmaApiError(detail ? `Figma: ${detail}` : `Figma API request failed (${response.status}).`, response.status);
  }
  return response.json() as Promise<T>;
}

const SCREEN_NODE_TYPES = new Set(["FRAME", "COMPONENT"]);
const SECTION_TYPE = "SECTION";
const MAX_IMPORT_SCREENS = 500;

/** High-level screens: page frames/components, or frames/components inside sections — never section roots. */
function collectScreenNodes(document: FigmaNode): FigmaNode[] {
  const screens: FigmaNode[] = [];
  for (const page of document.children ?? []) {
    for (const child of page.children ?? []) {
      if (SCREEN_NODE_TYPES.has(child.type)) {
        screens.push(child);
        continue;
      }
      if (child.type === SECTION_TYPE) {
        for (const nested of child.children ?? []) {
          if (SCREEN_NODE_TYPES.has(nested.type)) screens.push(nested);
        }
      }
    }
  }
  return screens;
}

function extractFlow(fileKey: string, file: FigmaFileResponse, images: Record<string, string | null>): FigmaImportResult & { inspectTrees: Record<string, InspectNode> } {
  const screenNodes = collectScreenNodes(file.document);
  const screenIds = new Set(screenNodes.map((node) => node.id));
  const ownerByNode = new Map<string, string>();
  const interactions: FigmaInteraction[] = [];

  function walk(node: FigmaNode, screenId: string | null) {
    const currentScreen = screenIds.has(node.id) ? node.id : screenId;
    if (currentScreen) ownerByNode.set(node.id, currentScreen);
    for (const interaction of node.interactions ?? []) {
      const actions = interaction.actions ?? [];
      const destinationNodeId = actions.find((action) => action.destinationId)?.destinationId ?? null;
      interactions.push({
        sourceNodeId: node.id,
        sourceNodeName: node.name || node.type,
        sourceScreenId: currentScreen || node.id,
        destinationNodeId,
        destinationScreenId: destinationNodeId,
        trigger: interaction.trigger?.type || "UNKNOWN",
        actions: actions.map((action) => action.navigation || action.type || "UNKNOWN"),
        sourceBounds: node.absoluteBoundingBox ?? null,
      });
    }
    for (const child of node.children ?? []) walk(child, currentScreen);
  }
  walk(file.document, null);

  for (const interaction of interactions) {
    if (interaction.destinationNodeId) {
      interaction.destinationScreenId = ownerByNode.get(interaction.destinationNodeId) || interaction.destinationNodeId;
    }
  }

  const counts = new Map<string, number>();
  for (const interaction of interactions) counts.set(interaction.sourceScreenId, (counts.get(interaction.sourceScreenId) ?? 0) + 1);
  const screens: FigmaScreen[] = screenNodes.slice(0, MAX_IMPORT_SCREENS).map((node) => ({
    id: node.id,
    name: node.name || "Untitled frame",
    type: node.type,
    imageUrl: images[node.id] ?? null,
    width: node.absoluteBoundingBox?.width ?? null,
    height: node.absoluteBoundingBox?.height ?? null,
    x: node.absoluteBoundingBox?.x ?? null,
    y: node.absoluteBoundingBox?.y ?? null,
    interactionCount: counts.get(node.id) ?? 0,
  }));

  const inspectTrees: Record<string, InspectNode> = {};
  for (const node of screenNodes.slice(0, MAX_IMPORT_SCREENS)) {
    const tree = normalizeInspectTree(node);
    if (tree) inspectTrees[node.id] = tree;
  }

  const warnings: string[] = [];
  if (screenNodes.length > screens.length) warnings.push(`Imported the first ${screens.length} of ${screenNodes.length} high-level screens.`);
  if (interactions.length === 0) warnings.push("No prototype interactions were found. Check that the imported page contains connected prototype frames.");
  return {
    file: { key: fileKey, name: file.name, version: file.version, lastModified: file.lastModified, thumbnailUrl: file.thumbnailUrl ?? null },
    screens,
    interactions,
    warnings,
    inspectTrees,
  };
}

function isPreviewExportError(error: unknown) {
  if (!(error instanceof FigmaApiError)) return false;
  // Layer-budget errors must not abort the import — screens should still save without previews.
  return error.status === 400 || error.status === 413 || /1000 frames|exportable items|smaller area|high level|too large|timeout/i.test(error.message);
}

/**
 * Export one node per Images API call. Figma's limit is ~1000 *layers across the
 * whole request*, so batching frame IDs easily blows past the budget even when
 * each individual frame would export fine.
 */
async function exportScreenPreviews(
  connectionId: string,
  fileKey: string,
  screenNodes: FigmaNode[],
  onProgress?: (progress: FigmaImportProgress) => void | Promise<void>,
) {
  const images: Record<string, string | null> = {};
  const skipped: string[] = [];
  const total = screenNodes.length;

  for (let index = 0; index < total; index += 1) {
    const node = screenNodes[index]!;
    await onProgress?.({
      stage: "rendering",
      message: `Rendering preview ${index + 1} of ${total}`,
      percent: 25 + Math.round((index / Math.max(1, total)) * 55),
      current: index,
      total,
    });
    try {
      const imageData = await figmaGet<{ images: Record<string, string | null> }>(
        connectionId,
        `/v1/images/${encodeURIComponent(fileKey)}?ids=${encodeURIComponent(node.id)}&format=png&scale=1`,
      );
      images[node.id] = imageData.images[node.id] ?? null;
    } catch (error) {
      if (!isPreviewExportError(error)) throw error;
      skipped.push(node.name || node.id);
      images[node.id] = null;
    }
  }

  await onProgress?.({
    stage: "rendering",
    message: skipped.length
      ? `Rendered ${total - skipped.length} of ${total} previews (${skipped.length} skipped)`
      : `Rendered ${total} of ${total} previews`,
    percent: 80,
    current: total,
    total,
  });

  return { images, skipped };
}

export async function importFigmaFile(connectionId: string, rawUrl: string, onProgress?: (progress: FigmaImportProgress) => void | Promise<void>) {
  await onProgress?.({ stage: "connecting", message: "Connecting to Figma", percent: 4 });
  const { fileKey } = parseFigmaFileUrl(rawUrl);
  await onProgress?.({ stage: "reading", message: "Reading file structure", percent: 10 });
  const file = await figmaGet<FigmaFileResponse>(connectionId, `/v1/files/${encodeURIComponent(fileKey)}`);
  const screenNodes = collectScreenNodes(file.document).slice(0, MAX_IMPORT_SCREENS);
  await onProgress?.({
    stage: "reading",
    message: `Found ${screenNodes.length} high-level screen${screenNodes.length === 1 ? "" : "s"}`,
    percent: 24,
    current: screenNodes.length,
    total: screenNodes.length,
  });
  const { images, skipped } = await exportScreenPreviews(connectionId, fileKey, screenNodes, onProgress);
  await onProgress?.({ stage: "mapping", message: "Mapping prototype interactions", percent: 84 });
  const extracted = extractFlow(fileKey, file, images);
  if (skipped.length) {
    extracted.warnings.push(
      `Saved all ${screenNodes.length} screens. Skipped previews for ${skipped.length} frame${skipped.length === 1 ? "" : "s"} that exceed Figma’s Images API layer budget${skipped.length <= 5 ? `: ${skipped.join(", ")}` : ""}.`,
    );
  }
  const { inspectTrees, ...result } = extracted;
  return { ...result, inspectTrees };
}

/** Fetch a single screen subtree for lazy inspect backfill. */
export async function fetchScreenInspectTree(connectionId: string, fileKey: string, screenId: string): Promise<InspectNode | null> {
  const payload = await figmaGet<{ nodes: Record<string, { document?: FigmaNode } | null> }>(
    connectionId,
    `/v1/files/${encodeURIComponent(fileKey)}/nodes?ids=${encodeURIComponent(screenId)}`,
  );
  const document = payload.nodes[screenId]?.document;
  return document ? normalizeInspectTree(document) : null;
}

/** Export a node image via Figma Images API. */
export async function exportFigmaNodeImage(
  connectionId: string,
  fileKey: string,
  nodeId: string,
  format: "png" | "svg",
  scale: 1 | 2,
) {
  const params = new URLSearchParams({
    ids: nodeId,
    format,
  });
  if (format === "png") params.set("scale", String(scale));
  const payload = await figmaGet<{ images: Record<string, string | null>; err?: string }>(
    connectionId,
    `/v1/images/${encodeURIComponent(fileKey)}?${params.toString()}`,
  );
  const url = payload.images[nodeId];
  if (!url) throw new FigmaApiError(payload.err || "Figma did not return an export for that node.", 404);
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new FigmaApiError("Unable to download the exported asset from Figma.", response.status);
  const bytes = Buffer.from(await response.arrayBuffer());
  const contentType = format === "svg" ? "image/svg+xml" : "image/png";
  return { bytes, contentType, format, scale };
}

/** Resolve any active workspace Figma connection for lazy inspect/export. */
export async function findWorkspaceConnectionId(organizationId: string, workspaceId: string) {
  const workspaceRows = await db.select({ id: figmaConnections.id }).from(figmaConnections).where(eq(figmaConnections.workspaceId, workspaceId)).limit(1);
  if (workspaceRows[0]) return workspaceRows[0].id;
  const orgRows = await db.select({ id: figmaConnections.id }).from(figmaConnections).where(eq(figmaConnections.organizationId, organizationId)).limit(1);
  return orgRows[0]?.id ?? null;
}
