import { NextResponse } from "next/server";

import { FigmaApiError, importFigmaFile } from "@/lib/figma/data";
import { saveFigmaImport } from "@/lib/figma/persistence";
import { getFigmaConnectionId } from "@/lib/figma/session";
import type { FigmaImportStreamEvent } from "@/lib/figma/types";
import { resolveTenantFromRequest } from "@/lib/tenant/context";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const connectionId = await getFigmaConnectionId();
  if (!connectionId) return NextResponse.json({ error: "Connect Figma before importing a file." }, { status: 401 });
  if (!(request.headers.get("content-type") || "").includes("application/json")) return NextResponse.json({ error: "Expected a JSON request." }, { status: 415 });
  const body = await request.json().catch(() => null) as { url?: unknown; projectKey?: unknown } | null;
  if (typeof body?.url !== "string" || !body.url.trim()) return NextResponse.json({ error: "A Figma file or prototype URL is required." }, { status: 400 });
  const rawUrl = body.url.trim();
  const projectKey = body.projectKey;

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (event: FigmaImportStreamEvent) => controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      void (async () => {
        try {
          const tenant = await resolveTenantFromRequest(request, projectKey);
          const extracted = await importFigmaFile(connectionId, rawUrl, (progress) => send({ type: "progress", ...progress }));
          const { inspectTrees, ...result } = extracted;
          send({ type: "progress", stage: "saving", message: `Saving ${result.screens.length} screens and ${result.interactions.length} interactions`, percent: 92, current: result.screens.length, total: result.screens.length });
          const version = await saveFigmaImport(tenant, connectionId, result, { source: "api", inspectTrees });
          send({ type: "progress", stage: "complete", message: "Import complete", percent: 100, current: result.screens.filter((screen) => Boolean(screen.imageUrl)).length, total: result.screens.length });
          send({ type: "complete", result: { ...result, ...version, importSource: "api" } });
        } catch (error) {
          send({ type: "error", error: error instanceof Error ? error.message : "Unable to import the Figma file.", status: error instanceof FigmaApiError ? error.status : 400, rateLimit: error instanceof FigmaApiError ? error.rateLimit : null });
        } finally {
          controller.close();
        }
      })();
    },
  });
  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store, no-transform", "X-Accel-Buffering": "no" } });
}
