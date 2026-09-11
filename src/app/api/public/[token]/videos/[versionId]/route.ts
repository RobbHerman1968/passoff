import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { db } from "@/db";
import { projectDesignVersions, revisionDesignVersions } from "@/db/schema";
import {
  isVideoDesignVersionPayload,
  parseAnyProjectDesignVersion,
} from "@/lib/projects/design-version";
import { resolveShareToken } from "@/lib/rooms/service";
import { readAssetStream } from "@/lib/rooms/storage";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string; versionId: string }> },
) {
  try {
    const { token, versionId } = await params;
    const resolved = await resolveShareToken(token);
    const pinned = (await db
      .select({ version: projectDesignVersions })
      .from(revisionDesignVersions)
      .innerJoin(projectDesignVersions, eq(projectDesignVersions.id, revisionDesignVersions.designVersionId))
      .where(and(
        eq(revisionDesignVersions.roomRevisionId, resolved.revision.id),
        eq(projectDesignVersions.id, versionId),
      ))
      .limit(1))[0];
    if (!pinned) return NextResponse.json({ error: "Video not found." }, { status: 404 });
    const payload = parseAnyProjectDesignVersion(pinned.version.payloadJson);
    if (!isVideoDesignVersionPayload(payload)) {
      return NextResponse.json({ error: "Video not found." }, { status: 404 });
    }
    const stored = await readAssetStream(payload.video.objectKey, {
      range: request.headers.get("range"),
    });
    if (!stored) return NextResponse.json({ error: "Video object not found." }, { status: 404 });
    return new Response(stored.stream, {
      status: stored.contentRange ? 206 : 200,
      headers: {
        "Content-Type": payload.video.mimeType,
        "Content-Length": String(stored.contentLength ?? stored.size ?? payload.video.byteSize),
        ...(stored.contentRange ? { "Content-Range": stored.contentRange } : {}),
        "Cache-Control": "private, no-store",
        "Accept-Ranges": "bytes",
        "Content-Disposition": "inline",
      },
    });
  } catch {
    return NextResponse.json({ error: "Video not found." }, { status: 404 });
  }
}
