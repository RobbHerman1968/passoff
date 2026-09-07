import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { db } from "@/db";
import { projects } from "@/db/schema";
import { deleteAllFigmaImports } from "@/lib/figma/persistence";
import { archiveRoom, deleteRoom, getRoomBundle } from "@/lib/rooms/service";
import {
  getDefaultWorkspaceScope,
  getTenantContextForProjectKey,
} from "@/lib/tenant/context";

export const runtime = "nodejs";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    if (!uuidPattern.test(id)) {
      return NextResponse.json({ error: "A valid room id is required." }, { status: 400 });
    }
    const scope = await getDefaultWorkspaceScope();
    const bundle = await getRoomBundle(scope.workspaceId, id);
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
    const { id } = await params;
    if (!uuidPattern.test(id)) {
      return NextResponse.json({ error: "A valid room id is required." }, { status: 400 });
    }
    const body = (await request.json()) as { action?: unknown };
    const scope = await getDefaultWorkspaceScope();
    if (body.action === "archive") {
      await archiveRoom(scope, id);
      return NextResponse.json({ ok: true, status: "ARCHIVED" });
    }
    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  } catch (error) {
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
    const { id } = await params;
    if (!uuidPattern.test(id)) {
      return NextResponse.json({ error: "A valid project id is required." }, { status: 400 });
    }

    const scope = await getDefaultWorkspaceScope();
    const project = (await db
      .select()
      .from(projects)
      .where(and(eq(projects.id, id), eq(projects.workspaceId, scope.workspaceId)))
      .limit(1))[0];

    if (!project) {
      return NextResponse.json({ error: "Project not found." }, { status: 404 });
    }

    const tenant = await getTenantContextForProjectKey(project.id);
    await deleteAllFigmaImports(tenant);
    const result = await deleteRoom(scope, project.id);

    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to delete the project." },
      { status: 400 },
    );
  }
}
