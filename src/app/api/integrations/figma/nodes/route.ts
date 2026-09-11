import { NextResponse } from "next/server";

import { FigmaApiError, fetchScreenInspectTree, findWorkspaceConnectionId } from "@/lib/figma/data";
import { getImportConnectionId, getInspectTree, getProjectDesignVersion, upsertInspectTree } from "@/lib/figma/persistence";
import { resolveTenantFromRequest } from "@/lib/tenant/context";

export const runtime = "nodejs";

function validFileKey(value: string | null): value is string {
  return Boolean(value && /^[A-Za-z0-9_-]+$/.test(value));
}

export async function GET(request: Request) {
  try {
    const tenant = await resolveTenantFromRequest(request);
    const url = new URL(request.url);
    const fileKey = url.searchParams.get("fileKey");
    const screenId = url.searchParams.get("screenId");
    const designVersionId = url.searchParams.get("designVersionId");
    if (!validFileKey(fileKey) || !screenId || screenId.length > 200 || !designVersionId) {
      return NextResponse.json({ error: "A valid Figma file and screen are required." }, { status: 400 });
    }

    const immutable = await getProjectDesignVersion(tenant, designVersionId);
    if (!immutable || immutable.payload.file.key !== fileKey) {
      return NextResponse.json({ error: "Design version not found." }, { status: 404 });
    }
    const versionTree = immutable.payload.inspectTrees.find((entry) => entry.screenId === screenId);
    if (versionTree) {
      return NextResponse.json({ tree: versionTree.tree, source: versionTree.source }, { headers: { "Cache-Control": "no-store" } });
    }
    if (immutable.design.currentVersionId !== designVersionId) {
      return NextResponse.json({
        tree: null,
        source: null,
        error: "No inspect tree was captured for this immutable design version.",
      }, { status: 200, headers: { "Cache-Control": "no-store" } });
    }

    const existing = await getInspectTree(tenant, fileKey, screenId);
    if (existing) {
      return NextResponse.json({ tree: existing, source: "stored" }, { headers: { "Cache-Control": "no-store" } });
    }

    const connectionId = (await getImportConnectionId(tenant, fileKey))
      ?? (await findWorkspaceConnectionId(tenant.organizationId, tenant.workspaceId));
    if (!connectionId) {
      return NextResponse.json({
        tree: null,
        source: null,
        error: "No inspect tree is stored for this screen. Connect Figma and reopen to backfill, or re-import via the plugin.",
      }, { status: 200, headers: { "Cache-Control": "no-store" } });
    }

    const tree = await fetchScreenInspectTree(connectionId, fileKey, screenId);
    if (!tree) {
      return NextResponse.json({ tree: null, source: null, error: "Figma did not return a node tree for this screen." }, { status: 200, headers: { "Cache-Control": "no-store" } });
    }
    await upsertInspectTree(tenant, fileKey, screenId, tree, "lazy");
    return NextResponse.json({ tree, source: "lazy" }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const status = error instanceof FigmaApiError ? error.status : 400;
    return NextResponse.json({
      error: error instanceof Error ? error.message : "Unable to load inspect tree.",
      rateLimit: error instanceof FigmaApiError ? error.rateLimit : null,
    }, { status });
  }
}
