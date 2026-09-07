import { NextResponse } from "next/server";

import { removeDraftRevisionAsset, renameDraftRevisionAsset } from "@/lib/rooms/service";
import { getDefaultWorkspaceScope } from "@/lib/tenant/context";

export const runtime = "nodejs";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; revisionAssetId: string }> },
) {
  try {
    const { id: projectId, revisionAssetId } = await params;
    if (!uuidPattern.test(projectId) || !uuidPattern.test(revisionAssetId)) {
      return NextResponse.json({ error: "Invalid id." }, { status: 400 });
    }

    const body = (await request.json()) as { label?: unknown };
    const label = typeof body.label === "string" ? body.label : "";
    const scope = await getDefaultWorkspaceScope();
    const result = await renameDraftRevisionAsset(scope, projectId, revisionAssetId, label);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to rename asset." },
      { status: 400 },
    );
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; revisionAssetId: string }> },
) {
  try {
    const { id: projectId, revisionAssetId } = await params;
    if (!uuidPattern.test(projectId) || !uuidPattern.test(revisionAssetId)) {
      return NextResponse.json({ error: "Invalid id." }, { status: 400 });
    }

    const scope = await getDefaultWorkspaceScope();
    const result = await removeDraftRevisionAsset(scope, projectId, revisionAssetId);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to remove asset." },
      { status: 400 },
    );
  }
}
