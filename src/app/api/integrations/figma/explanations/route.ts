import { NextResponse } from "next/server";

import { authzResponse } from "@/lib/auth/authorization";
import {
  isValidFigmaFileKey,
  parseCreateFigmaExplanation,
  parseUpdateFigmaExplanation,
} from "@/lib/figma/explanation-contract";
import {
  createFigmaExplanation,
  copyFigmaExplanations,
  deleteFigmaExplanation,
  FigmaExplanationTargetNotFoundError,
  listFigmaExplanations,
  updateFigmaExplanation,
} from "@/lib/figma/explanations";
import { getTenantContextForProjectKey } from "@/lib/tenant/context";

export const runtime = "nodejs";

const noStore = { "Cache-Control": "no-store" };

function jsonBody(request: Request) {
  if (!request.headers.get("content-type")?.toLowerCase().includes("application/json")) {
    return null;
  }
  return request.json() as Promise<Record<string, unknown>>;
}

function safeError(
  error: unknown,
  message: string,
) {
  if (error instanceof FigmaExplanationTargetNotFoundError) {
    return NextResponse.json({ error: error.message }, { status: 404, headers: noStore });
  }
  return authzResponse(error)
    ?? NextResponse.json({ error: message }, { status: 400, headers: noStore });
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const projectKey = url.searchParams.get("projectKey")?.trim();
    const fileKey = url.searchParams.get("fileKey");
    const screenId = url.searchParams.get("screenId")?.trim();
    const designVersionId = url.searchParams.get("designVersionId")?.trim();
    if (
      !projectKey
      || !isValidFigmaFileKey(fileKey)
      || !screenId
      || !designVersionId
      || screenId.length > 200
    ) {
      return NextResponse.json(
        { error: "A project, Figma file, and screen are required." },
        { status: 400, headers: noStore },
      );
    }
    const tenant = await getTenantContextForProjectKey(projectKey);
    const explanations = await listFigmaExplanations(tenant, fileKey, screenId, designVersionId);
    return NextResponse.json({ explanations }, { headers: noStore });
  } catch (error) {
    return safeError(error, "Unable to load screen explanations.");
  }
}

export async function POST(request: Request) {
  const bodyPromise = jsonBody(request);
  if (!bodyPromise) {
    return NextResponse.json(
      { error: "JSON is required." },
      { status: 415, headers: noStore },
    );
  }
  try {
    const body = await bodyPromise;
    if (body.action === "copy") {
      const projectKey = typeof body.projectKey === "string" ? body.projectKey.trim() : "";
      const sourceDesignVersionId = typeof body.sourceDesignVersionId === "string"
        ? body.sourceDesignVersionId.trim()
        : "";
      const targetDesignVersionId = typeof body.targetDesignVersionId === "string"
        ? body.targetDesignVersionId.trim()
        : "";
      if (!projectKey || !sourceDesignVersionId || !targetDesignVersionId) {
        return NextResponse.json({ error: "Source and target design versions are required." }, { status: 400, headers: noStore });
      }
      const tenant = await getTenantContextForProjectKey(projectKey);
      const explanations = await copyFigmaExplanations(tenant, sourceDesignVersionId, targetDesignVersionId);
      return NextResponse.json({ explanations }, { status: 201, headers: noStore });
    }
    const input = parseCreateFigmaExplanation(body);
    if (!input) {
      return NextResponse.json(
        { error: "The explanation or its screen position is invalid." },
        { status: 400, headers: noStore },
      );
    }
    const tenant = await getTenantContextForProjectKey(input.projectKey);
    const explanation = await createFigmaExplanation(tenant, input);
    return NextResponse.json(explanation, { status: 201, headers: noStore });
  } catch (error) {
    return safeError(error, "Unable to save this screen explanation.");
  }
}

export async function PATCH(request: Request) {
  const bodyPromise = jsonBody(request);
  if (!bodyPromise) {
    return NextResponse.json(
      { error: "JSON is required." },
      { status: 415, headers: noStore },
    );
  }
  try {
    const input = parseUpdateFigmaExplanation(await bodyPromise);
    if (!input) {
      return NextResponse.json(
        { error: "The explanation changes are invalid." },
        { status: 400, headers: noStore },
      );
    }
    const tenant = await getTenantContextForProjectKey(input.projectKey);
    const explanation = await updateFigmaExplanation(tenant, input);
    if (!explanation) {
      return NextResponse.json(
        { error: "Explanation not found." },
        { status: 404, headers: noStore },
      );
    }
    return NextResponse.json(explanation, { headers: noStore });
  } catch (error) {
    return safeError(error, "Unable to update this explanation.");
  }
}

export async function DELETE(request: Request) {
  const bodyPromise = jsonBody(request);
  if (!bodyPromise) {
    return NextResponse.json(
      { error: "JSON is required." },
      { status: 415, headers: noStore },
    );
  }
  try {
    const body = await bodyPromise;
    const projectKey = typeof body.projectKey === "string" ? body.projectKey.trim() : "";
    const id = typeof body.id === "string" ? body.id.trim() : "";
    if (!projectKey || !id) {
      return NextResponse.json(
        { error: "A project and explanation are required." },
        { status: 400, headers: noStore },
      );
    }
    const tenant = await getTenantContextForProjectKey(projectKey);
    if (!await deleteFigmaExplanation(tenant, id)) {
      return NextResponse.json(
        { error: "Explanation not found." },
        { status: 404, headers: noStore },
      );
    }
    return NextResponse.json({ deleted: true }, { headers: noStore });
  } catch (error) {
    return safeError(error, "Unable to delete this explanation.");
  }
}
