import { NextResponse } from "next/server";

import { createRoomInProject } from "@/lib/rooms/service";
import { getDefaultWorkspaceScope } from "@/lib/tenant/context";

export const runtime = "nodejs";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!(request.headers.get("content-type") || "").includes("application/json")) {
    return NextResponse.json({ error: "Expected a JSON request." }, { status: 415 });
  }
  try {
    const [{ id }, body, scope] = await Promise.all([
      context.params,
      request.json() as Promise<{ name?: unknown }>,
      getDefaultWorkspaceScope(),
    ]);
    const { project: room } = await createRoomInProject(scope, id, {
      name: typeof body.name === "string" ? body.name : "",
    });
    return NextResponse.json(room, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const { authzResponse } = await import("@/lib/auth/authorization");
    return authzResponse(error) ?? NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to create the room." },
      { status: 400 },
    );
  }
}
