import { NextResponse } from "next/server";

import { db } from "@/db";
import { projectDesignVersions } from "@/db/schema";
import { readDesignVersionPreviewPng } from "@/lib/figma/preview-storage";
import { resolveShareToken } from "@/lib/rooms/service";
import type { TenantContext } from "@/lib/tenant/context";
import { and, eq } from "drizzle-orm";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string; designVersionId: string; nodeId: string }> },
) {
  try {
    const { token, designVersionId, nodeId } = await params;
    const resolved = await resolveShareToken(token);
    const membership = resolved.designMembership.find((item) => item.designVersionId === designVersionId);
    if (!membership || !membership.screens.some((screen) => screen.id === nodeId)) {
      return NextResponse.json({ error: "Preview not found." }, { status: 404 });
    }
    const version = (await db
      .select({ designId: projectDesignVersions.designId })
      .from(projectDesignVersions)
      .where(and(
        eq(projectDesignVersions.id, designVersionId),
        eq(projectDesignVersions.projectId, resolved.project.id),
      ))
      .limit(1))[0];
    if (!version) return NextResponse.json({ error: "Preview not found." }, { status: 404 });
    const tenant = {
      organizationId: resolved.project.organizationId,
      workspaceId: resolved.project.workspaceId,
      projectId: resolved.project.id,
      roomId: resolved.room.id,
      projectSlug: resolved.project.slug,
      userId: "",
      organizationName: "",
      workspaceName: "",
      projectName: resolved.project.name,
      clientName: resolved.project.clientName,
      userName: "",
      userEmail: "",
    } satisfies TenantContext;
    const bytes = await readDesignVersionPreviewPng(
      tenant,
      version.designId,
      designVersionId,
      nodeId,
    );
    if (!bytes) return NextResponse.json({ error: "Preview not found." }, { status: 404 });
    return new NextResponse(bytes, {
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "private, max-age=31536000, immutable",
      },
    });
  } catch {
    return NextResponse.json({ error: "Preview not found." }, { status: 404 });
  }
}
