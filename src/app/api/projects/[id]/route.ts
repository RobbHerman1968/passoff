import { NextResponse } from "next/server";

import { archiveRoom, deleteRoom, getRoomBundle, updateRoom } from "@/lib/rooms/service";
import { getDefaultWorkspaceScope } from "@/lib/tenant/context";

export const runtime = "nodejs";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: roomId } = await params;
    if (!uuidPattern.test(roomId)) {
      return NextResponse.json({ error: "A valid room id is required." }, { status: 400 });
    }
    const scope = await getDefaultWorkspaceScope();
    const bundle = await getRoomBundle(scope.workspaceId, roomId);
    return NextResponse.json(bundle, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to load room." },
      { status: 400 },
    );
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: roomId } = await params;
    if (!uuidPattern.test(roomId)) {
      return NextResponse.json({ error: "A valid room id is required." }, { status: 400 });
    }
    const body = (await request.json()) as {
      action?: unknown;
      name?: unknown;
      clientName?: unknown;
    };
    const scope = await getDefaultWorkspaceScope();
    if (body.action === "archive") {
      await archiveRoom(scope, roomId);
      return NextResponse.json({ ok: true, status: "ARCHIVED" });
    }
    if (body.action === "rename") {
      const name = typeof body.name === "string" ? body.name : "";
      const clientName = typeof body.clientName === "string" ? body.clientName : "";
      const room = await updateRoom(scope, roomId, { name, clientName });
      return NextResponse.json(
        {
          ok: true,
          id: room.id,
          name: room.name,
          clientName: room.clientName,
          slug: room.slug,
          status: room.status,
        },
        { headers: { "Cache-Control": "no-store" } },
      );
    }
    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  } catch (error) {
    const { authzResponse } = await import("@/lib/auth/authorization");
    const authz = authzResponse(error);
    if (authz) return authz;
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to update room." },
      { status: 400 },
    );
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: roomId } = await params;
    if (!uuidPattern.test(roomId)) {
      return NextResponse.json({ error: "A valid room id is required." }, { status: 400 });
    }

    const scope = await getDefaultWorkspaceScope();
    const result = await deleteRoom(scope, roomId);

    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const { authzResponse } = await import("@/lib/auth/authorization");
    const authz = authzResponse(error);
    if (authz) return authz;
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to delete the room." },
      { status: 400 },
    );
  }
}
