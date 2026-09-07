import { NextResponse } from "next/server";

import { addHandoffItem, reopenRoom } from "@/lib/rooms/service";
import { getDefaultWorkspaceScope } from "@/lib/tenant/context";

export const runtime = "nodejs";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    if (!uuidPattern.test(id)) {
      return NextResponse.json({ error: "Invalid room id." }, { status: 400 });
    }
    const body = (await request.json()) as {
      action?: unknown;
      label?: unknown;
      category?: unknown;
      notes?: unknown;
      externalUrl?: unknown;
      assetId?: unknown;
    };
    const scope = await getDefaultWorkspaceScope();

    if (body.action === "reopen") {
      const draft = await reopenRoom(scope, id);
      return NextResponse.json({ revision: draft }, { status: 201 });
    }

    const label = typeof body.label === "string" ? body.label.trim() : "";
    if (!label) return NextResponse.json({ error: "A handoff label is required." }, { status: 400 });

    const item = await addHandoffItem({
      scope,
      projectId: id,
      label,
      category: typeof body.category === "string" ? body.category : undefined,
      notes: typeof body.notes === "string" ? body.notes : undefined,
      externalUrl: typeof body.externalUrl === "string" ? body.externalUrl : undefined,
      assetId: typeof body.assetId === "string" ? body.assetId : undefined,
    });
    return NextResponse.json({ item }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to update handoff." },
      { status: 400 },
    );
  }
}
