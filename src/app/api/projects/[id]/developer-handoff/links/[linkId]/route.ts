import { NextResponse } from "next/server";

import { authzResponse, requireRoomMembership } from "@/lib/auth/authorization";
import {
  DeveloperHandoffError,
  revokeDeveloperHandoffLink,
} from "@/lib/developer-handoff/service";

export const runtime = "nodejs";
const NO_STORE_HEADERS = { "Cache-Control": "private, no-store, max-age=0" };

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; linkId: string }> },
) {
  try {
    const { id: roomId, linkId } = await params;
    const { scope } = await requireRoomMembership(roomId);
    return NextResponse.json(
      await revokeDeveloperHandoffLink(scope, roomId, linkId),
      { headers: NO_STORE_HEADERS },
    );
  } catch (error) {
    const authz = authzResponse(error);
    if (authz) {
      authz.headers.set("Cache-Control", NO_STORE_HEADERS["Cache-Control"]);
      return authz;
    }
    const status = error instanceof DeveloperHandoffError ? error.status : 400;
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to revoke developer handoff link." },
      { status, headers: NO_STORE_HEADERS },
    );
  }
}
