import { createHash } from "node:crypto";

import { NextResponse } from "next/server";

import {
  DeveloperHandoffError,
  resolveDeveloperHandoffToken,
} from "@/lib/developer-handoff/service";
import { publicDeveloperHandoffSnapshot } from "@/lib/developer-handoff/snapshot";
import { clientIp, rateLimit } from "@/lib/rooms/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0",
  Pragma: "no-cache",
  "X-Content-Type-Options": "nosniff",
};

export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await params;
    const key = createHash("sha256").update(token).digest("hex").slice(0, 24);
    const limited = rateLimit(`developer-handoff:${key}:${clientIp(request)}`, 120, 60_000);
    if (!limited.ok) {
      return NextResponse.json(
        { error: "Too many requests." },
        {
          status: 429,
          headers: { ...NO_STORE_HEADERS, "Retry-After": String(limited.retryAfterSec) },
        },
      );
    }
    const resolved = await resolveDeveloperHandoffToken(token, true);
    return NextResponse.json(
      {
        snapshot: publicDeveloperHandoffSnapshot(token, resolved.snapshot.payload),
        integrity: {
          algorithm: "sha256",
          digest: resolved.snapshot.contentSha256,
        },
        expiresAt: resolved.link.expiresAt,
      },
      { headers: NO_STORE_HEADERS },
    );
  } catch (error) {
    return NextResponse.json(
      { error: "Not found." },
      {
        status: error instanceof DeveloperHandoffError ? error.status : 404,
        headers: NO_STORE_HEADERS,
      },
    );
  }
}
