import { sdkJsonResponse, sdkPreflightResponse } from "@/lib/sdk/cors";
import { sanitizeScreenshot } from "@/lib/sdk/sanitize";
import {
  resolveVerificationSession,
  verificationSessionErrorMessage,
} from "@/lib/verification/session";
import { attachVerificationEvidence } from "@/lib/verification/service";

export const runtime = "nodejs";

const METHODS = "POST, OPTIONS";
const BODY_MAX = 400_000;

export async function OPTIONS(request: Request) {
  return sdkPreflightResponse(request, METHODS);
}

export async function POST(request: Request) {
  const sessionLookup = await resolveVerificationSession(request);
  if (!sessionLookup.ok) {
    return sdkJsonResponse(
      {
        ok: false,
        error: sessionLookup.reason,
        message: verificationSessionErrorMessage(sessionLookup.reason),
      },
      sessionLookup.status,
      sessionLookup.corsOrigin,
      METHODS,
    );
  }

  let raw: unknown;
  try {
    const text = await request.text();
    if (text.length > BODY_MAX) {
      return sdkJsonResponse({ ok: false }, 400, sessionLookup.corsOrigin, METHODS);
    }
    raw = text ? JSON.parse(text) : null;
  } catch {
    return sdkJsonResponse({ ok: false }, 400, sessionLookup.corsOrigin, METHODS);
  }

  const input = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const screenshot = sanitizeScreenshot({
    status: input.status === "ready" ? "captured" : "unavailable",
    reason: input.reason,
    dataUrl: input.dataUrl,
    annotation: input.annotation,
  });

  const attached = await attachVerificationEvidence({
    session: sessionLookup.session,
    captureStatus: screenshot.base64 ? "ready" : "failed",
    mimeType: screenshot.mimeType,
    base64: screenshot.base64,
    byteLength: screenshot.byteLength,
    annotation: screenshot.annotation,
    reason: screenshot.reason,
  });

  return sdkJsonResponse(
    { ok: attached.ok },
    attached.ok ? 200 : 400,
    sessionLookup.corsOrigin,
    METHODS,
  );
}
