import { createHash } from "node:crypto";

import { NextResponse } from "next/server";

import { resolveDeveloperHandoffScreen } from "@/lib/developer-handoff/service";
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
  { params }: { params: Promise<{ token: string; mediaId: string }> },
) {
  try {
    const { token, mediaId } = await params;
    const key = createHash("sha256").update(token).digest("hex").slice(0, 24);
    const limited = rateLimit(`developer-handoff-media:${key}:${clientIp(request)}`, 240, 60_000);
    if (!limited.ok) {
      return NextResponse.json(
        { error: "Too many requests." },
        {
          status: 429,
          headers: { ...NO_STORE_HEADERS, "Retry-After": String(limited.retryAfterSec) },
        },
      );
    }
    const { screen, object } = await resolveDeveloperHandoffScreen(token, mediaId);
    return new Response(object.stream, {
      headers: {
        ...NO_STORE_HEADERS,
        "Content-Type": screen.contentType,
        "Content-Length": String(screen.bytes),
        "Content-Disposition": `inline; filename="handoff-${screen.id}.png"`,
        "Content-Security-Policy": "default-src 'none'; sandbox",
        "X-Content-SHA256": screen.sha256,
      },
    });
  } catch {
    return NextResponse.json(
      { error: "Not found." },
      { status: 404, headers: NO_STORE_HEADERS },
    );
  }
}
