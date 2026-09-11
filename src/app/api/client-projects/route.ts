import { NextResponse } from "next/server";

import { createClientProject, listClientProjects } from "@/lib/projects/service";
import { getDefaultWorkspaceScope } from "@/lib/tenant/context";

export const runtime = "nodejs";

export async function GET() {
  try {
    const scope = await getDefaultWorkspaceScope();
    return NextResponse.json(
      { projects: await listClientProjects(scope.workspaceId) },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    const { authzResponse } = await import("@/lib/auth/authorization");
    return authzResponse(error) ?? NextResponse.json({ error: "Unable to list projects." }, { status: 400 });
  }
}

export async function POST(request: Request) {
  if (!(request.headers.get("content-type") || "").includes("application/json")) {
    return NextResponse.json({ error: "Expected a JSON request." }, { status: 415 });
  }
  try {
    const body = (await request.json()) as { name?: unknown; clientName?: unknown };
    const scope = await getDefaultWorkspaceScope();
    const project = await createClientProject(scope, {
      name: typeof body.name === "string" ? body.name : "",
      clientName: typeof body.clientName === "string" ? body.clientName : "",
    });
    return NextResponse.json(project, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const { authzResponse } = await import("@/lib/auth/authorization");
    return authzResponse(error) ?? NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to create the project." },
      { status: 400 },
    );
  }
}

