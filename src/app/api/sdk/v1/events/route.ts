import { getRequestFingerprint } from "@/lib/auth/request-fingerprint";
import { sdkJsonResponse, sdkPreflightResponse } from "@/lib/sdk/cors";
import { MAX_BATCH_BYTES } from "@/lib/telemetry/event-schema";
import { ingestTelemetryBatch } from "@/lib/telemetry/ingest";

export const runtime = "nodejs";

export async function OPTIONS(request: Request) {
  return sdkPreflightResponse(request, "POST, OPTIONS");
}

export async function POST(request: Request) {
  const headerOrigin = request.headers.get("Origin");
  const contentLength = Number(request.headers.get("Content-Length") ?? "0");
  if (Number.isFinite(contentLength) && contentLength > MAX_BATCH_BYTES) {
    return sdkJsonResponse({ ok: false }, 413, undefined, "POST, OPTIONS");
  }

  let text: string;
  try {
    text = await request.text();
  } catch {
    return sdkJsonResponse({ ok: false }, 400, undefined, "POST, OPTIONS");
  }
  if (text.length > MAX_BATCH_BYTES) {
    return sdkJsonResponse({ ok: false }, 413, undefined, "POST, OPTIONS");
  }

  const fingerprint = await getRequestFingerprint();
  const result = await ingestTelemetryBatch({
    rawText: text,
    headerOrigin,
    userAgent: request.headers.get("user-agent"),
    rateLimitSubjects: [fingerprint],
  });

  if (!result.ok) {
    return sdkJsonResponse(
      { ok: false },
      result.status,
      result.corsOrigin,
      "POST, OPTIONS",
      result.retryAfterSeconds,
    );
  }

  return sdkJsonResponse(
    { ok: true, accepted: result.accepted },
    202,
    result.corsOrigin,
    "POST, OPTIONS",
  );
}
