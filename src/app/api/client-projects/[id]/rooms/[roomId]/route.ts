import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { db } from "@/db";
import { rooms } from "@/db/schema";
import { deleteRoom } from "@/lib/rooms/service";
import { getDefaultWorkspaceScope } from "@/lib/tenant/context";

export const runtime = "nodejs";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; roomId: string }> },
) {
  try {
    const [{ id, roomId }, scope] = await Promise.all([
      params,
      getDefaultWorkspaceScope(),
    ]);
    const room = (
      await db
        .select({ id: rooms.id })
        .from(rooms)
        .where(
          and(
            eq(rooms.id, roomId),
            eq(rooms.clientProjectId, id),
            eq(rooms.workspaceId, scope.workspaceId),
          ),
        )
        .limit(1)
    )[0];

    if (!room) {
      return NextResponse.json({ error: "Room not found." }, { status: 404 });
    }

    return NextResponse.json(
      await deleteRoom(scope, room.id),
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    const { authzResponse } = await import("@/lib/auth/authorization");
    return authzResponse(error) ?? NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to delete the room." },
      { status: 400 },
    );
  }
}
