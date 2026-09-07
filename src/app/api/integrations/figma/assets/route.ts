import { NextResponse } from "next/server";

import { FigmaApiError, exportFigmaNodeImage, findWorkspaceConnectionId } from "@/lib/figma/data";
import { getImportConnectionId } from "@/lib/figma/persistence";
import { getPrototypeTenantContext } from "@/lib/tenant/context";

export const runtime = "nodejs";

function validFileKey(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]+$/.test(value);
}

export async function GET(request: Request) {
  try {
    const tenant = await getPrototypeTenantContext();
    const url = new URL(request.url);
    const fileKey = url.searchParams.get("fileKey");
    const nodeId = url.searchParams.get("nodeId");
    const format = url.searchParams.get("format") === "svg" ? "svg" : "png";
    const scale = url.searchParams.get("scale") === "2" ? 2 : 1;
    if (!validFileKey(fileKey) || !nodeId || nodeId.length > 200) {
      return NextResponse.json({ error: "A valid Figma file and node are required." }, { status: 400 });
    }

    const connectionId = (await getImportConnectionId(tenant, fileKey))
      ?? (await findWorkspaceConnectionId(tenant.organizationId, tenant.workspaceId));
    if (!connectionId) {
      return NextResponse.json({ error: "Connect Figma to export assets from this file." }, { status: 401 });
    }

    const exported = await exportFigmaNodeImage(connectionId, fileKey, nodeId, format, scale);
    const filename = `passoff-${nodeId.replace(/[^A-Za-z0-9_-]+/g, "-")}.${format}`;
    return new NextResponse(new Uint8Array(exported.bytes), {
      status: 200,
      headers: {
        "Content-Type": exported.contentType,
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (error) {
    const status = error instanceof FigmaApiError ? error.status : 400;
    return NextResponse.json({
      error: error instanceof Error ? error.message : "Unable to export asset.",
      rateLimit: error instanceof FigmaApiError ? error.rateLimit : null,
    }, { status });
  }
}
