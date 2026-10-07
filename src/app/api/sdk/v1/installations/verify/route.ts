import { NextResponse } from "next/server";

import { getRequestFingerprint } from "@/lib/auth/request-fingerprint";
import { normalizeOrigin } from "@/lib/installations/origin";
import {
  installationVerifySchema,
  VERIFY_BODY_MAX_BYTES,
  verifyWebsiteInstallation,
} from "@/lib/installations/verify";

export const runtime = "nodejs";

function corsHeaders(origin?: string) {
  const headers = new Headers({
    Vary: "Origin",
    "Cache-Control": "no-store",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Accept",
    "Access-Control-Max-Age": "600",
  });
  if (origin) {
    // Never use *. Only an exact validated origin may be echoed.
    headers.set("Access-Control-Allow-Origin", origin);
  }
  return headers;
}

function jsonResponse(
  body: Record<string, unknown>,
  status: number,
  origin?: string,
  retryAfterSeconds?: number,
) {
  const headers = corsHeaders(origin);
  if (retryAfterSeconds) {
    headers.set("Retry-After", String(retryAfterSeconds));
  }
  return NextResponse.json(body, { status, headers });
}

export async function OPTIONS(request: Request) {
  const originHeader = request.headers.get("Origin");
  const normalized = normalizeOrigin(originHeader);
  // Preflight may echo a syntactically valid origin. Installation allow-list is enforced on POST.
  if (!normalized.ok) {
    return new NextResponse(null, { status: 204, headers: corsHeaders() });
  }
  return new NextResponse(null, {
    status: 204,
    headers: corsHeaders(normalized.origin),
  });
}

export async function POST(request: Request) {
  const headerOrigin = request.headers.get("Origin");
  const contentLength = Number(request.headers.get("Content-Length") ?? "0");
  if (Number.isFinite(contentLength) && contentLength > VERIFY_BODY_MAX_BYTES) {
    return jsonResponse({ ok: false }, 400);
  }

  let raw: unknown;
  try {
    const text = await request.text();
    if (text.length > VERIFY_BODY_MAX_BYTES) {
      return jsonResponse({ ok: false }, 400);
    }
    raw = text ? JSON.parse(text) : null;
  } catch {
    return jsonResponse({ ok: false }, 400);
  }

  const parsed = installationVerifySchema.safeParse(raw);
  if (!parsed.success) {
    return jsonResponse({ ok: false }, 400);
  }

  const fingerprint = await getRequestFingerprint();
  const result = await verifyWebsiteInstallation({
    body: parsed.data,
    headerOrigin,
    rateLimitSubjects: [fingerprint],
  });

  if (!result.ok) {
    return jsonResponse(
      { ok: false },
      result.status,
      result.corsOrigin,
      result.retryAfterSeconds,
    );
  }

  // Minimal bootstrap configuration only — no team, user, project, or session data.
  return jsonResponse(
    {
      ok: true,
      status: result.status,
      analytics: result.analytics ?? { enabled: false, schemaVersion: 1 },
    },
    200,
    result.corsOrigin,
  );
}
