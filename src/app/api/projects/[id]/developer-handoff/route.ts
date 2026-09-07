import { NextResponse } from "next/server";

import { authzResponse, requireProjectMembership } from "@/lib/auth/authorization";
import {
  DeveloperHandoffError,
  getDeveloperHandoffSummary,
  publishDeveloperHandoffSnapshot,
} from "@/lib/developer-handoff/service";

export const runtime = "nodejs";

const NO_STORE_HEADERS = { "Cache-Control": "private, no-store, max-age=0" };

function errorResponse(error: unknown) {
  const authz = authzResponse(error);
  if (authz) {
    authz.headers.set("Cache-Control", NO_STORE_HEADERS["Cache-Control"]);
    return authz;
  }
  const status = error instanceof DeveloperHandoffError ? error.status : 400;
  return NextResponse.json(
    { error: error instanceof Error ? error.message : "Developer handoff request failed." },
    { status, headers: NO_STORE_HEADERS },
  );
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const { scope } = await requireProjectMembership(id);
    const fileKey = new URL(request.url).searchParams.get("fileKey") || "";
    return NextResponse.json(
      await getDeveloperHandoffSummary(scope, id, fileKey),
      { headers: NO_STORE_HEADERS },
    );
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const { scope } = await requireProjectMembership(id);
    const body = (await request.json().catch(() => ({}))) as {
      fileKey?: unknown;
      expiresInDays?: unknown;
    };
    const result = await publishDeveloperHandoffSnapshot(
      scope,
      id,
      typeof body.fileKey === "string" ? body.fileKey : "",
      {
        expiresInDays:
          body.expiresInDays === null || typeof body.expiresInDays === "number"
            ? body.expiresInDays
            : undefined,
      },
    );
    return NextResponse.json(
      {
        snapshot: {
          id: result.snapshot.id,
          version: result.snapshot.version,
          contentSha256: result.snapshot.contentSha256,
          publishedAt: result.snapshot.publishedAt,
        },
        link: {
          id: result.link.id,
          snapshotId: result.link.snapshotId,
          token: result.link.token,
          apiUrl: `/api/developer-handoff/${encodeURIComponent(result.link.token)}`,
          expiresAt: result.link.expiresAt,
        },
      },
      { status: 201, headers: NO_STORE_HEADERS },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
