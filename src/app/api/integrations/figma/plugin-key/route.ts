import { and, eq, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";

import { db } from "@/db";
import { clientProjects } from "@/db/schema";
import { authzResponse } from "@/lib/auth/authorization";
import { generateProjectPluginKey, hashProjectPluginKey } from "@/lib/figma/plugin-key";
import { getTenantContextForProjectKey } from "@/lib/tenant/context";

export const runtime = "nodejs";

function noStore(payload: object, status = 200) {
  return NextResponse.json(payload, { status, headers: { "Cache-Control": "no-store" } });
}

async function resolveProject(projectKey: unknown) {
  const tenant = await getTenantContextForProjectKey(projectKey);
  const projectId = tenant.projectId;
  const project = (
    await db
      .select({
        id: clientProjects.id,
        keyHash: clientProjects.figmaPluginKeyHash,
        keyCreatedAt: clientProjects.figmaPluginKeyCreatedAt,
      })
      .from(clientProjects)
      .where(and(
        eq(clientProjects.id, projectId),
        eq(clientProjects.organizationId, tenant.organizationId),
        eq(clientProjects.workspaceId, tenant.workspaceId),
      ))
      .limit(1)
  )[0];
  if (!project) throw new Error("Project not found.");
  return { tenant, project };
}

export async function GET(request: Request) {
  try {
    const projectKey = new URL(request.url).searchParams.get("projectKey");
    const { project } = await resolveProject(projectKey);
    return noStore({
      configured: Boolean(project.keyHash),
      createdAt: project.keyCreatedAt?.toISOString() ?? null,
    });
  } catch (error) {
    return authzResponse(error) ?? noStore(
      { error: error instanceof Error ? error.message : "Unable to read the Figma plugin key." },
      400,
    );
  }
}

export async function POST(request: Request) {
  if (!(request.headers.get("content-type") || "").includes("application/json")) {
    return noStore({ error: "Expected a JSON request." }, 415);
  }

  try {
    const body = await request.json() as { projectKey?: unknown; rotate?: unknown };
    const { tenant, project } = await resolveProject(body.projectKey);
    const rotate = body.rotate === true;
    if (project.keyHash && !rotate) {
      return noStore({ error: "This project already has a plugin key. Rotate it if the original key is unavailable." }, 409);
    }

    const key = generateProjectPluginKey();
    const keyHash = hashProjectPluginKey(key);
    if (!keyHash) throw new Error("Unable to generate a valid plugin key.");
    const createdAt = new Date();
    const projectId = tenant.projectId;
    const updated = await db
      .update(clientProjects)
      .set({
        figmaPluginKeyHash: keyHash,
        figmaPluginKeyCreatedAt: createdAt,
        updatedAt: createdAt,
      })
      .where(and(
        eq(clientProjects.id, projectId),
        eq(clientProjects.organizationId, tenant.organizationId),
        eq(clientProjects.workspaceId, tenant.workspaceId),
        ...(rotate ? [] : [isNull(clientProjects.figmaPluginKeyHash)]),
      ))
      .returning({ id: clientProjects.id });
    if (!rotate && !updated.length) {
      return noStore({ error: "This project already has a plugin key. Rotate it if the original key is unavailable." }, 409);
    }

    return noStore({ key, createdAt: createdAt.toISOString(), rotated: Boolean(project.keyHash) }, 201);
  } catch (error) {
    return authzResponse(error) ?? noStore(
      { error: error instanceof Error ? error.message : "Unable to create the Figma plugin key." },
      400,
    );
  }
}
