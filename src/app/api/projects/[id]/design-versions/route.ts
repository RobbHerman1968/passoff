import { NextResponse } from "next/server";

import {
  pinDesignVersionToDraft,
  removeDesignVersionFromDraft,
} from "@/lib/rooms/service";
import { getDefaultWorkspaceScope } from "@/lib/tenant/context";

export const runtime = "nodejs";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: roomId } = await params;
    const body = await request.json() as {
      designId?: unknown;
      designVersionId?: unknown;
      selectedScreenIds?: unknown;
    };
    if (
      !uuidPattern.test(roomId)
      || typeof body.designId !== "string"
      || !uuidPattern.test(body.designId)
      || (body.designVersionId !== undefined
        && (typeof body.designVersionId !== "string" || !uuidPattern.test(body.designVersionId)))
      || (body.selectedScreenIds !== undefined
        && (!Array.isArray(body.selectedScreenIds)
          || body.selectedScreenIds.length === 0
          || body.selectedScreenIds.length > 500
          || body.selectedScreenIds.some((value) => typeof value !== "string" || !value.trim())))
    ) {
      return NextResponse.json({ error: "Valid room and design identifiers are required." }, { status: 400 });
    }
    const membership = await pinDesignVersionToDraft({
      scope: await getDefaultWorkspaceScope(),
      roomId,
      designId: body.designId,
      designVersionId: typeof body.designVersionId === "string" ? body.designVersionId : null,
      selectedScreenIds: Array.isArray(body.selectedScreenIds)
        ? body.selectedScreenIds.map((value) => String(value))
        : null,
    });
    return NextResponse.json({ membership }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to add this design to the room." },
      { status: 400 },
    );
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: roomId } = await params;
    const revisionDesignVersionId = new URL(request.url).searchParams.get("revisionDesignVersionId");
    if (!uuidPattern.test(roomId) || !revisionDesignVersionId || !uuidPattern.test(revisionDesignVersionId)) {
      return NextResponse.json({ error: "Valid room and pinned design identifiers are required." }, { status: 400 });
    }
    await removeDesignVersionFromDraft(
      await getDefaultWorkspaceScope(),
      roomId,
      revisionDesignVersionId,
    );
    return NextResponse.json({ deleted: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to remove this design." },
      { status: 400 },
    );
  }
}
