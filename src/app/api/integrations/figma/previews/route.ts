import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { db } from "@/db";
import { figmaImports, projectDesigns, projectDesignVersions } from "@/db/schema";
import { readDesignVersionPreviewPng, readPreviewPng } from "@/lib/figma/preview-storage";
import { resolveTenantFromRequest } from "@/lib/tenant/context";

export const runtime = "nodejs";

function validFileKey(value: string | null): value is string {
  return Boolean(value && /^[A-Za-z0-9_-]+$/.test(value));
}

function validNodeId(value: string | null): value is string {
  return Boolean(value && value.length > 0 && value.length <= 200);
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const fileKey = url.searchParams.get("fileKey");
    const designVersionId = url.searchParams.get("designVersionId");
    const nodeId = url.searchParams.get("nodeId");
    if ((!designVersionId && !validFileKey(fileKey)) || !validNodeId(nodeId)) {
      return NextResponse.json({ error: "A valid file and design are required." }, { status: 400 });
    }

    const tenant = await resolveTenantFromRequest(request);
    if (designVersionId) {
      const version = (await db
        .select({
          designId: projectDesigns.id,
        })
        .from(projectDesignVersions)
        .innerJoin(projectDesigns, eq(projectDesigns.id, projectDesignVersions.designId))
        .where(and(
          eq(projectDesignVersions.id, designVersionId),
          eq(projectDesignVersions.organizationId, tenant.organizationId),
          eq(projectDesignVersions.workspaceId, tenant.workspaceId),
          eq(projectDesignVersions.projectId, tenant.projectId),
        ))
        .limit(1))[0];
      if (!version) return NextResponse.json({ error: "Preview not found." }, { status: 404 });
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
    }

    const record = (await db.select({ id: figmaImports.id }).from(figmaImports).where(and(
      eq(figmaImports.organizationId, tenant.organizationId),
      eq(figmaImports.projectId, tenant.projectId),
      eq(figmaImports.figmaFileKey, fileKey!),
    )).limit(1))[0];
    if (!record) return NextResponse.json({ error: "Preview not found." }, { status: 404 });

    const bytes = await readPreviewPng(tenant, fileKey!, nodeId);
    if (!bytes) return NextResponse.json({ error: "Preview not found." }, { status: 404 });

    return new NextResponse(bytes, {
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "private, max-age=86400, immutable",
      },
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load preview." }, { status: 400 });
  }
}
