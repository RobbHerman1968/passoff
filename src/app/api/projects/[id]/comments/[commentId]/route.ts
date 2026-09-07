import { NextResponse } from "next/server";

import { resolveComment } from "@/lib/rooms/service";
import { getDefaultWorkspaceScope } from "@/lib/tenant/context";

export const runtime = "nodejs";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; commentId: string }> },
) {
  try {
    const { id, commentId } = await params;
    if (!uuidPattern.test(id) || !uuidPattern.test(commentId)) {
      return NextResponse.json({ error: "Invalid ids." }, { status: 400 });
    }
    const body = (await request.json()) as { status?: unknown };
    const status = body.status;
    if (status !== "RESOLVED" && status !== "WONT_FIX" && status !== "OPEN") {
      return NextResponse.json({ error: "Invalid status." }, { status: 400 });
    }
    const scope = await getDefaultWorkspaceScope();
    const comment = await resolveComment(scope, commentId, status);
    return NextResponse.json({ comment });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to update comment." },
      { status: 400 },
    );
  }
}
