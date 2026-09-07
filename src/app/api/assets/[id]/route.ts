import { NextResponse } from "next/server";

import { AuthzError, authzResponse, requireActiveWorkspaceMembership } from "@/lib/auth/authorization";
import {
  getAssetForAccess,
  listReleasedHandoffItems,
  resolveShareToken,
} from "@/lib/rooms/service";
import { readAssetStream } from "@/lib/rooms/storage";
import { logWarn } from "@/lib/logging";

export const runtime = "nodejs";
export const maxDuration = 60;

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Private file delivery. Blob URLs are never authorization.
 * Owner: active workspace membership. Client: valid share token for the room.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    if (!uuidPattern.test(id)) {
      return NextResponse.json({ error: "Not found." }, { status: 404 });
    }

    const asset = await getAssetForAccess(id);
    if (!asset || !asset.objectKey || asset.uploadStatus !== "ready") {
      return NextResponse.json({ error: "Not found." }, { status: 404 });
    }

    const url = new URL(request.url);
    const shareToken = url.searchParams.get("token");
    const disposition = url.searchParams.get("download") === "1" ? "attachment" : "inline";

    if (shareToken) {
      const resolved = await resolveShareToken(shareToken);
      if (resolved.project.id !== asset.projectId) {
        throw new AuthzError("Not found.", 404);
      }

      const inPublishedRevision = resolved.membership.some((m) => m.asset.id === asset.id);
      let isHandoffAsset = false;
      if (resolved.project.handoffReleasedAt) {
        const handoff = await listReleasedHandoffItems(resolved.project.id);
        isHandoffAsset = handoff.some((h) => h.assetId === asset.id);
      }

      if (!inPublishedRevision && !isHandoffAsset) {
        throw new AuthzError("Not found.", 404);
      }
    } else {
      const scope = await requireActiveWorkspaceMembership();
      if (asset.workspaceId !== scope.workspaceId) {
        throw new AuthzError("Not found.", 404);
      }
    }

    const locator = asset.blobUrl || asset.objectKey;
    const streamed = await readAssetStream(locator);
    if (!streamed) {
      return NextResponse.json({ error: "Not found." }, { status: 404 });
    }

    const filename = (asset.label || "file").replace(/[^\w.\-]+/g, "_").slice(0, 120);
    const headers = new Headers({
      "Content-Type": asset.mime || streamed.contentType || "application/octet-stream",
      "Content-Disposition": `${disposition}; filename="${filename}"`,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
    });
    if (streamed.size != null) {
      headers.set("Content-Length", String(streamed.size));
    }

    return new NextResponse(streamed.stream, { headers });
  } catch (error) {
    const authz = authzResponse(error);
    if (authz) return authz;
    if (
      error instanceof Error &&
      /expired|revoked|invalid|superseded|Nothing has been published/i.test(error.message)
    ) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    logWarn("asset.delivery_failed", {
      error: error instanceof Error ? error.message : "unknown",
    });
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
}
