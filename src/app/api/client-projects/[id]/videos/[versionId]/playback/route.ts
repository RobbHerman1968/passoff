import { NextResponse } from "next/server";

import { authzResponse, requireClientProjectMembership } from "@/lib/auth/authorization";
import { db } from "@/db";
import { projectDesignVersions } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import {
  isVideoDesignVersionPayload,
  parseAnyProjectDesignVersion,
} from "@/lib/projects/design-version";
import { readAssetStream } from "@/lib/rooms/storage";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string; versionId: string }> },
) {
  try {
    const { id: projectId, versionId } = await params;
    const { scope } = await requireClientProjectMembership(projectId);
    const version = (await db.select().from(projectDesignVersions).where(and(
      eq(projectDesignVersions.id, versionId),
      eq(projectDesignVersions.projectId, projectId),
      eq(projectDesignVersions.organizationId, scope.organizationId),
      eq(projectDesignVersions.workspaceId, scope.workspaceId),
    )).limit(1))[0];
    if (!version) return NextResponse.json({ error: "Video not found." }, { status: 404 });
    const payload = parseAnyProjectDesignVersion(version.payloadJson);
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
  } catch (error) {
    const authz = authzResponse(error);
    if (authz) return authz;
    return NextResponse.json({ error: "Unable to play video." }, { status: 400 });
  }
}
