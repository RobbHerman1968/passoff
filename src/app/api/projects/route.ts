import { NextResponse } from "next/server";

import { createRoom, listRooms } from "@/lib/rooms/service";
import { getDefaultWorkspaceScope } from "@/lib/tenant/context";

export const runtime = "nodejs";

export async function GET() {
  try {
    const scope = await getDefaultWorkspaceScope();
    const rows = await listRooms(scope.workspaceId);
    return NextResponse.json(
      {
        organizationName: scope.organizationName,
        workspaceName: scope.workspaceName,
        projects: rows.map((room) => ({
          id: room.id,
          name: room.name,
          clientName: room.clientName,
          slug: room.slug,
          status: room.status,
          createdAt: room.createdAt.toISOString(),
          updatedAt: room.updatedAt.toISOString(),
        })),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    const { authzResponse } = await import("@/lib/auth/authorization");
    const authz = authzResponse(error);
    if (authz) return authz;
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to list rooms." },
      { status: 400 },
    );
  }
}

export async function POST(request: Request) {
  if (!(request.headers.get("content-type") || "").includes("application/json")) {
    return NextResponse.json({ error: "Expected a JSON request." }, { status: 415 });
  }

  try {
    const body = (await request.json()) as { name?: unknown; clientName?: unknown };
    const name = typeof body.name === "string" ? body.name.trim().slice(0, 120) : "";
    const clientName =
      typeof body.clientName === "string" ? body.clientName.trim().slice(0, 120) : "";
    if (!name) return NextResponse.json({ error: "A room name is required." }, { status: 400 });
    if (!clientName) {
      return NextResponse.json({ error: "A client name is required." }, { status: 400 });
    }

    const scope = await getDefaultWorkspaceScope();
    const { project: room } = await createRoom(scope, { name, clientName });

    return NextResponse.json(
      {
        id: room.id,
        name: room.name,
        clientName: room.clientName,
        slug: room.slug,
        status: room.status,
        createdAt: room.createdAt.toISOString(),
        updatedAt: room.updatedAt.toISOString(),
      },
      { status: 201, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    const { authzResponse } = await import("@/lib/auth/authorization");
    const authz = authzResponse(error);
    if (authz) return authz;
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to create the room." },
      { status: 400 },
    );
  }
}
