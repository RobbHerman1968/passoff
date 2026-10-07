import { sdkJsonResponse, sdkPreflightResponse } from "@/lib/sdk/cors";
import {
  resolveVerificationSession,
  verificationSessionErrorMessage,
} from "@/lib/verification/session";
import { submitVerificationResults } from "@/lib/verification/service";

export const runtime = "nodejs";

const METHODS = "POST, OPTIONS";
const BODY_MAX = 200_000;

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

  const payload = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const idempotencyKey = request.headers.get("Idempotency-Key");

  const result = await submitVerificationResults({
    session: sessionLookup.session,
    corsOrigin: sessionLookup.corsOrigin,
    idempotencyKey: idempotencyKey?.slice(0, 128) ?? null,
    payload,
  });

  if (!result.ok) {
    return sdkJsonResponse(
      { ok: false, error: result.code },
      result.status,
      sessionLookup.corsOrigin,
      METHODS,
    );
  }

  return sdkJsonResponse(
    { ok: true, overall: result.overall, duplicate: result.duplicate ?? false },
    200,
    sessionLookup.corsOrigin,
    METHODS,
  );
}
