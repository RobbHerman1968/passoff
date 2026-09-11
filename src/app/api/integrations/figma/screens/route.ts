import { NextResponse } from "next/server";

import {
  combineFigmaImportScreens,
  deleteFigmaImportBreakpointGroup,
  deleteFigmaImportScreen,
  deleteProjectDesignScreens,
  renameFigmaImportBreakpointGroup,
  setFigmaImportGroupPrimary,
  setFigmaImportMainScreen,
  uncombineFigmaImportScreen,
} from "@/lib/figma/persistence";
import { resolveTenantFromRequest } from "@/lib/tenant/context";

export const runtime = "nodejs";

function validFileKey(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]+$/.test(value);
}

function validScreenId(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 200;
}

function validGroupId(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]+$/.test(value) && value.length <= 64;
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function DELETE(request: Request) {
  try {
    const url = new URL(request.url);
    const fileKey = url.searchParams.get("fileKey");
    const screenId = url.searchParams.get("screenId");
    const screenIds = url.searchParams.getAll("screenId").filter(validScreenId);
    const groupId = url.searchParams.get("groupId");
    const designId = url.searchParams.get("designId");
    const designVersionId = url.searchParams.get("designVersionId");
    if (!validFileKey(fileKey)) {
      return NextResponse.json({ error: "A valid file is required." }, { status: 400 });
    }
    const tenant = await resolveTenantFromRequest(request);
    if (designId || designVersionId) {
      if (
        !designId
        || !designVersionId
        || !uuidPattern.test(designId)
        || !uuidPattern.test(designVersionId)
        || !screenIds.length
      ) {
        return NextResponse.json({ error: "Valid design, version, and screen identifiers are required." }, { status: 400 });
      }
      const result = await deleteProjectDesignScreens(tenant, designId, designVersionId, screenIds);
      return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
    }
    if (validGroupId(groupId)) {
      const result = await deleteFigmaImportBreakpointGroup(tenant, fileKey, groupId);
      return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
    }
    if (!validScreenId(screenId)) {
      return NextResponse.json({ error: "A valid design or breakpoint set is required." }, { status: 400 });
    }
    const result = await deleteFigmaImportScreen(tenant, fileKey, screenId);
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to delete the design." }, { status: 400 });
  }
}

export async function PATCH(request: Request) {
  try {
    if (!(request.headers.get("content-type") || "").includes("application/json")) {
      return NextResponse.json({ error: "Expected a JSON request." }, { status: 415 });
    }
    const body = await request.json() as {
      fileKey?: unknown;
      screenId?: unknown;
      screenIds?: unknown;
      groupId?: unknown;
      name?: unknown;
      primaryScreenId?: unknown;
      action?: unknown;
      projectKey?: unknown;
    };
    if (!validFileKey(body.fileKey)) {
      return NextResponse.json({ error: "A valid file key is required." }, { status: 400 });
    }
    const tenant = await resolveTenantFromRequest(request, body.projectKey);

    if (body.action === "set-main") {
      if (!validScreenId(body.screenId)) return NextResponse.json({ error: "A valid design is required." }, { status: 400 });
      return NextResponse.json(await setFigmaImportMainScreen(tenant, body.fileKey, body.screenId), { headers: { "Cache-Control": "no-store" } });
    }

    if (body.action === "combine") {
      const screenIds = Array.isArray(body.screenIds) ? body.screenIds.filter(validScreenId) : [];
      const name = typeof body.name === "string" ? body.name : undefined;
      const primaryScreenId = validScreenId(body.primaryScreenId) ? body.primaryScreenId : undefined;
      return NextResponse.json(await combineFigmaImportScreens(tenant, body.fileKey, screenIds, { name, primaryScreenId }), { headers: { "Cache-Control": "no-store" } });
    }

    if (body.action === "rename-group") {
      if (!validGroupId(body.groupId) || typeof body.name !== "string") {
        return NextResponse.json({ error: "A valid group and name are required." }, { status: 400 });
      }
      return NextResponse.json(await renameFigmaImportBreakpointGroup(tenant, body.fileKey, body.groupId, body.name), { headers: { "Cache-Control": "no-store" } });
    }

    if (body.action === "set-group-primary") {
      if (!validGroupId(body.groupId) || !validScreenId(body.screenId)) {
        return NextResponse.json({ error: "A valid group and design are required." }, { status: 400 });
      }
      return NextResponse.json(await setFigmaImportGroupPrimary(tenant, body.fileKey, body.groupId, body.screenId), { headers: { "Cache-Control": "no-store" } });
    }

    if (body.action === "uncombine") {
      if (!validScreenId(body.screenId)) return NextResponse.json({ error: "A valid design is required." }, { status: 400 });
      return NextResponse.json(await uncombineFigmaImportScreen(tenant, body.fileKey, body.screenId), { headers: { "Cache-Control": "no-store" } });
    }

    return NextResponse.json({ error: "Unsupported action." }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to update the design." }, { status: 400 });
  }
}
