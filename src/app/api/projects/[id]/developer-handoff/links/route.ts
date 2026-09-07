import { NextResponse } from "next/server";

import { authzResponse, requireProjectMembership } from "@/lib/auth/authorization";
import {
  createDeveloperHandoffLink,
  DeveloperHandoffError,
} from "@/lib/developer-handoff/service";

export const runtime = "nodejs";
const NO_STORE_HEADERS = { "Cache-Control": "private, no-store, max-age=0" };

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const { scope } = await requireProjectMembership(id);
    const body = (await request.json().catch(() => ({}))) as {
      snapshotId?: unknown;
      expiresInDays?: unknown;
    };
    if (typeof body.snapshotId !== "string") {
      return NextResponse.json(
        { error: "snapshotId is required." },
        { status: 400, headers: NO_STORE_HEADERS },
      );
    }
    const result = await createDeveloperHandoffLink(scope, id, body.snapshotId, {
      expiresInDays:
        body.expiresInDays === null || typeof body.expiresInDays === "number"
          ? body.expiresInDays
          : undefined,
    });
    return NextResponse.json(
      {
        id: result.id,
        snapshotId: result.snapshotId,
        token: result.token,
        apiUrl: `/api/developer-handoff/${encodeURIComponent(result.token)}`,
        expiresAt: result.expiresAt,
      },
      { status: 201, headers: NO_STORE_HEADERS },
    );
  } catch (error) {
    const authz = authzResponse(error);
    if (authz) {
      authz.headers.set("Cache-Control", NO_STORE_HEADERS["Cache-Control"]);
      return authz;
    }
    const status = error instanceof DeveloperHandoffError ? error.status : 400;
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to create developer handoff link." },
      { status, headers: NO_STORE_HEADERS },
    );
  }
}
