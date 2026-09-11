import { NextResponse } from "next/server";

import { FigmaApiError, importFigmaFile } from "@/lib/figma/data";
import { deleteAllFigmaImports, deleteProjectDesignVersion, getCurrentProjectDesignVersion, getFigmaImport, getProjectDesignVersion, listFigmaImports, listProjectDesigns, listProjectDesignVersions, renameFigmaImport, saveFigmaImport } from "@/lib/figma/persistence";
import { getFigmaConnectionId } from "@/lib/figma/session";
import { resolveTenantFromRequest } from "@/lib/tenant/context";

export async function POST(request: Request) {
  const connectionId = await getFigmaConnectionId();
  if (!connectionId) return NextResponse.json({ error: "Connect Figma before importing a file." }, { status: 401 });
  try {
    if (!(request.headers.get("content-type") || "").includes("application/json")) {
      return NextResponse.json({ error: "Expected a JSON request." }, { status: 415 });
    }
    const body = (await request.json()) as { url?: unknown; projectKey?: unknown };
    if (typeof body.url !== "string" || !body.url.trim()) {
      return NextResponse.json({ error: "A Figma file or prototype URL is required." }, { status: 400 });
    }
    const extracted = await importFigmaFile(connectionId, body.url.trim());
    const { inspectTrees, ...result } = extracted;
    const tenant = await resolveTenantFromRequest(request, body.projectKey);
    const version = await saveFigmaImport(tenant, connectionId, result, { source: "api", inspectTrees });
    return NextResponse.json({ ...result, ...version, importSource: "api" }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const status = error instanceof FigmaApiError ? error.status : 400;
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to import the Figma file.", rateLimit: error instanceof FigmaApiError ? error.rateLimit : null }, { status });
  }
}

export async function GET(request: Request) {
  try {
    const tenant = await resolveTenantFromRequest(request);
    const url = new URL(request.url);
    const fileKey = url.searchParams.get("fileKey");
    const designId = url.searchParams.get("designId");
    const designVersionId = url.searchParams.get("designVersionId");
    if (designId && url.searchParams.get("history") === "1") {
      return NextResponse.json(
        { versions: await listProjectDesignVersions(tenant, designId) },
        { headers: { "Cache-Control": "no-store" } },
      );
    }
    if (designVersionId || designId) {
      const version = designVersionId
        ? await getProjectDesignVersion(tenant, designVersionId)
        : await getCurrentProjectDesignVersion(tenant, designId!);
      if (!version || (designId && version.design.id !== designId)) {
        return NextResponse.json({ error: "Saved design version not found." }, { status: 404 });
      }
      return NextResponse.json(version.result, { headers: { "Cache-Control": "no-store" } });
    }
    if (!fileKey) {
      const [imports, designs] = await Promise.all([
        listFigmaImports(tenant),
        listProjectDesigns(tenant),
      ]);
      return NextResponse.json({ imports, designs }, { headers: { "Cache-Control": "no-store" } });
    }
    if (!/^[A-Za-z0-9_-]+$/.test(fileKey)) return NextResponse.json({ error: "A valid Figma file key is required." }, { status: 400 });
    const result = await getFigmaImport(tenant, fileKey);
    if (!result) return NextResponse.json({ error: "Saved Figma file not found." }, { status: 404 });
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load saved Figma imports." }, { status: 400 });
  }
}

export async function PATCH(request: Request) {
  try {
    if (!(request.headers.get("content-type") || "").includes("application/json")) {
      return NextResponse.json({ error: "Expected a JSON request." }, { status: 415 });
    }
    const body = await request.json() as { fileKey?: unknown; name?: unknown; projectKey?: unknown };
    if (typeof body.fileKey !== "string" || !/^[A-Za-z0-9_-]+$/.test(body.fileKey)) {
      return NextResponse.json({ error: "A valid file key is required." }, { status: 400 });
    }
    if (typeof body.name !== "string") {
      return NextResponse.json({ error: "A project name is required." }, { status: 400 });
    }
    const renamed = await renameFigmaImport(await resolveTenantFromRequest(request, body.projectKey), body.fileKey, body.name);
    return NextResponse.json(renamed, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to rename the project." }, { status: 400 });
  }
}

export async function DELETE(request: Request) {
  try {
    const url = new URL(request.url);
    const designId = url.searchParams.get("designId");
    const designVersionId = url.searchParams.get("designVersionId");
    if (designId && designVersionId) {
      const tenant = await resolveTenantFromRequest(request);
      const result = await deleteProjectDesignVersion(tenant, designId, designVersionId);
      return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
    }
    const all = url.searchParams.get("all");
    if (all !== "1" && all !== "true") {
      return NextResponse.json({ error: "Pass all=1 to delete every imported file in this project." }, { status: 400 });
    }
    const tenant = await resolveTenantFromRequest(request);
    await deleteAllFigmaImports(tenant);
    return NextResponse.json({ deleted: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to delete project files." }, { status: 400 });
  }
}
