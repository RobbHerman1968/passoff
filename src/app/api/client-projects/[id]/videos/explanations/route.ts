import { NextResponse } from "next/server";

import { authzResponse, requireClientProjectMembership } from "@/lib/auth/authorization";
import {
  copyVideoExplanations,
  createVideoExplanation,
  listVideoExplanations,
  updateVideoExplanation,
} from "@/lib/projects/video";

export const runtime = "nodejs";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function errorResponse(error: unknown) {
  const authz = authzResponse(error);
  if (authz) return authz;
  return NextResponse.json(
    { error: error instanceof Error ? error.message : "Explanation request failed." },
    { status: 400 },
  );
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: projectId } = await params;
    const query = new URL(request.url).searchParams;
    const designId = query.get("designId") || "";
    const designVersionId = query.get("designVersionId") || "";
    if (![projectId, designId, designVersionId].every((value) => uuidPattern.test(value))) {
      return NextResponse.json({ error: "Valid project, design, and version identifiers are required." }, { status: 400 });
    }
    const { scope } = await requireClientProjectMembership(projectId);
    return NextResponse.json({
      explanations: await listVideoExplanations(scope, projectId, designId, designVersionId),
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: projectId } = await params;
    if (!uuidPattern.test(projectId)) {
      return NextResponse.json({ error: "Invalid project id." }, { status: 400 });
    }
    const { scope } = await requireClientProjectMembership(projectId);
    const body = await request.json() as Record<string, unknown>;
    if (body.action === "copy") {
      const designId = typeof body.designId === "string" ? body.designId : "";
      const sourceDesignVersionId = typeof body.sourceDesignVersionId === "string" ? body.sourceDesignVersionId : "";
      const targetDesignVersionId = typeof body.targetDesignVersionId === "string" ? body.targetDesignVersionId : "";
      if (![designId, sourceDesignVersionId, targetDesignVersionId].every((value) => uuidPattern.test(value))) {
        return NextResponse.json({ error: "Valid design version identifiers are required." }, { status: 400 });
      }
      return NextResponse.json({
        explanations: await copyVideoExplanations({
          scope,
          projectId,
          designId,
          sourceDesignVersionId,
          targetDesignVersionId,
        }),
      }, { status: 201 });
    }
    const designId = typeof body.designId === "string" ? body.designId : "";
    const designVersionId = typeof body.designVersionId === "string" ? body.designVersionId : "";
    if (![designId, designVersionId].every((value) => uuidPattern.test(value))) {
      return NextResponse.json({ error: "Valid design version identifiers are required." }, { status: 400 });
    }
    const explanation = await createVideoExplanation({
      scope,
      projectId,
      designId,
      designVersionId,
      videoTimeMs: typeof body.videoTimeMs === "number" ? body.videoTimeMs : Number.NaN,
      category: typeof body.category === "string" ? body.category : "",
      title: typeof body.title === "string" ? body.title : "",
      body: typeof body.body === "string" ? body.body : "",
    });
    return NextResponse.json({ explanation }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: projectId } = await params;
    if (!uuidPattern.test(projectId)) {
      return NextResponse.json({ error: "Invalid project id." }, { status: 400 });
    }
    const { scope } = await requireClientProjectMembership(projectId);
    const body = await request.json() as Record<string, unknown>;
    const explanationId = typeof body.explanationId === "string" ? body.explanationId : "";
    if (!uuidPattern.test(explanationId)) {
      return NextResponse.json({ error: "A valid explanation id is required." }, { status: 400 });
    }
    if (body.status !== undefined && body.status !== "draft" && body.status !== "published") {
      return NextResponse.json({ error: "Explanation status must be draft or published." }, { status: 400 });
    }
    const explanation = await updateVideoExplanation({
      scope,
      projectId,
      explanationId,
      category: typeof body.category === "string" ? body.category : undefined,
      title: typeof body.title === "string" ? body.title : undefined,
      body: typeof body.body === "string" ? body.body : undefined,
      videoTimeMs: typeof body.videoTimeMs === "number" ? body.videoTimeMs : undefined,
      publish: body.publish === true,
      status: body.status === "draft" || body.status === "published" ? body.status : undefined,
    });
    return NextResponse.json({ explanation });
  } catch (error) {
    return errorResponse(error);
  }
}
