import { NextResponse } from "next/server";

import { authzResponse, requireClientProjectMembership } from "@/lib/auth/authorization";
import { getProjectVideoUploadStatus } from "@/lib/projects/video";

export const runtime = "nodejs";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; uploadSessionId: string }> },
) {
  try {
    const { id: projectId, uploadSessionId } = await params;
    if (!uuidPattern.test(projectId) || !uuidPattern.test(uploadSessionId)) {
      return NextResponse.json({ error: "Invalid video upload session." }, { status: 400 });
    }
    const { scope } = await requireClientProjectMembership(projectId);
    const status = await getProjectVideoUploadStatus(scope, projectId, uploadSessionId);
    return NextResponse.json(status, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const authz = authzResponse(error);
    if (authz) return authz;
    const message = error instanceof Error ? error.message : "Unable to load video upload status.";
    return NextResponse.json(
      { error: message },
      { status: /not found/i.test(message) ? 404 : 400 },
    );
  }
}
