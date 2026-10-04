import { NextResponse } from "next/server";

import { normalizeOrigin } from "@/lib/installations/origin";

export function sdkCorsHeaders(options: {
  origin?: string;
  methods: string;
  allowHeaders?: string;
}) {
  const headers = new Headers({
    Vary: "Origin",
    "Cache-Control": "no-store",
    "Access-Control-Allow-Methods": options.methods,
    "Access-Control-Allow-Headers":
      options.allowHeaders ?? "Content-Type, Accept, Authorization, Idempotency-Key",
    "Access-Control-Max-Age": "600",
  });
  if (options.origin) {
    // Never use *. Only an exact validated origin may be echoed.
    headers.set("Access-Control-Allow-Origin", options.origin);
  }
  return headers;
}

export function sdkPreflightResponse(request: Request, methods: string) {
  const originHeader = request.headers.get("Origin");
  const normalized = normalizeOrigin(originHeader);
  if (!normalized.ok) {
    return new NextResponse(null, {
      status: 204,
      headers: sdkCorsHeaders({ methods }),
    });
  }
  return new NextResponse(null, {
    status: 204,
    headers: sdkCorsHeaders({ origin: normalized.origin, methods }),
  });
}

export function sdkJsonResponse(
  body: Record<string, unknown>,
  status: number,
  origin?: string,
  methods = "GET, POST, OPTIONS",
  retryAfterSeconds?: number,
) {
  const headers = sdkCorsHeaders({ origin, methods });
  if (retryAfterSeconds) {
    headers.set("Retry-After", String(retryAfterSeconds));
  }
  return NextResponse.json(body, { status, headers });
}
