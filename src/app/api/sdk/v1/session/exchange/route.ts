import { getRequestFingerprint } from "@/lib/auth/request-fingerprint";
import { sdkJsonResponse, sdkPreflightResponse } from "@/lib/sdk/cors";
import {
  EXCHANGE_BODY_MAX_BYTES,
  sdkExchangeBodySchema,
} from "@/lib/sdk/sanitize";
import { exchangeSdkSession } from "@/lib/sdk/session";

export const runtime = "nodejs";

const METHODS = "POST, OPTIONS";

export async function OPTIONS(request: Request) {
  return sdkPreflightResponse(request, METHODS);
}

export async function POST(request: Request) {
  const contentLength = Number(request.headers.get("Content-Length") ?? "0");
  if (Number.isFinite(contentLength) && contentLength > EXCHANGE_BODY_MAX_BYTES) {
    return sdkJsonResponse({ ok: false }, 400, undefined, METHODS);
  }

  let raw: unknown;
  try {
    const text = await request.text();
    if (text.length > EXCHANGE_BODY_MAX_BYTES) {
      return sdkJsonResponse({ ok: false }, 400, undefined, METHODS);
    }
    raw = text ? JSON.parse(text) : null;
  } catch {
    return sdkJsonResponse({ ok: false }, 400, undefined, METHODS);
  }

  const parsed = sdkExchangeBodySchema.safeParse(raw);
  if (!parsed.success) {
    return sdkJsonResponse({ ok: false }, 400, undefined, METHODS);
  }

  const fingerprint = await getRequestFingerprint();
  const result = await exchangeSdkSession({
    installationKey: parsed.data.installationKey,
    exchangeCode: parsed.data.exchangeCode,
    headerOrigin: request.headers.get("Origin"),
    rateLimitSubjects: [fingerprint],
  });

  if (!result.ok) {
    return sdkJsonResponse(
      {
        ok: false,
        error: result.code ?? "invalid",
      },
      result.status,
      result.corsOrigin,
      METHODS,
      result.retryAfterSeconds,
    );
  }

  return sdkJsonResponse(
    {
      ok: true,
      sessionToken: result.sessionToken,
      expiresAt: result.expiresAt,
      canComment: result.canComment,
      reviewerName: result.reviewerName,
      privateSelectors: result.privateSelectors,
    },
    200,
    result.corsOrigin,
    METHODS,
  );
}
