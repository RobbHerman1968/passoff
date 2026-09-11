import { NextResponse } from "next/server";

import { updateClientProject } from "@/lib/projects/service";
import { getDefaultWorkspaceScope } from "@/lib/tenant/context";

export const runtime = "nodejs";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!(request.headers.get("content-type") || "").includes("application/json")) {
    return NextResponse.json({ error: "Expected a JSON request." }, { status: 415 });
  }

  try {
    const [{ id }, body, scope] = await Promise.all([
      params,
      request.json() as Promise<{ name?: unknown; clientName?: unknown }>,
      getDefaultWorkspaceScope(),
    ]);
    const project = await updateClientProject(scope, id, {
      name: typeof body.name === "string" ? body.name : "",
      clientName: typeof body.clientName === "string" ? body.clientName : "",
    });
    return NextResponse.json(
      {
        id: project.id,
        name: project.name,
        clientName: project.clientName,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    const { authzResponse } = await import("@/lib/auth/authorization");
    return authzResponse(error) ?? NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to update the project." },
      { status: 400 },
    );
  }
}
