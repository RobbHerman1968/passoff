import { randomUUID } from "node:crypto";

import { NextResponse } from "next/server";

import { saveFigmaImport } from "@/lib/figma/persistence";
import type { FigmaImportResult } from "@/lib/figma/types";
import { resolveTenantFromRequest } from "@/lib/tenant/context";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!(request.headers.get("content-type") || "").includes("application/json")) {
    return NextResponse.json({ error: "Expected a JSON request." }, { status: 415 });
  }

  try {
    const body = (await request.json()) as { name?: unknown; projectKey?: unknown };
    const name = typeof body.name === "string" ? body.name.trim().slice(0, 200) : "";
    if (!name) return NextResponse.json({ error: "A project name is required." }, { status: 400 });

    const now = new Date();
    const result: FigmaImportResult = {
      file: {
        key: `created-${randomUUID().replaceAll("-", "")}`,
        name,
        version: `created-${now.getTime()}`,
        lastModified: now.toISOString(),
        thumbnailUrl: null,
      },
      screens: [],
      interactions: [],
      warnings: ["Created as a blank Pass-Off file. Import from Figma or upload images to add screens."],
      importSource: "created",
    };

    const tenant = await resolveTenantFromRequest(request, body.projectKey);
    await saveFigmaImport(tenant, null, result, { source: "created" });
    return NextResponse.json(result, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to create the project file." }, { status: 400 });
  }
}
