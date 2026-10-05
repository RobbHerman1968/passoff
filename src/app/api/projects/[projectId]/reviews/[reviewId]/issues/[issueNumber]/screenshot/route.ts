import { NextResponse } from "next/server";
import { z } from "zod";

import { getIssueScreenshotForReview } from "@/lib/issues/list";
import { requireWorkspaceContext } from "@/lib/workspaces/context";

export const runtime = "nodejs";

const paramsSchema = z.object({
  projectId: z.uuid(),
  reviewId: z.uuid(),
  issueNumber: z.coerce.number().int().positive(),
});

function privateResponse(body: BodyInit | null, init: ResponseInit) {
  const headers = new Headers(init.headers);
  headers.set("Cache-Control", "private, no-store");
  return new NextResponse(body, { ...init, headers });
}

function unavailableJson(message: string, status: number) {
  return privateResponse(JSON.stringify({ ok: false, message }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export async function GET(
  _request: Request,
  context: {
    params: Promise<{
      projectId: string;
      reviewId: string;
      issueNumber: string;
    }>;
  },
) {
  const parsedParams = paramsSchema.safeParse(await context.params);
  if (!parsedParams.success) {
    return unavailableJson("This picture isn’t available.", 404);
  }

  const auth = await requireWorkspaceContext();
  if (!auth.ok) {
    return unavailableJson(
      auth.reason === "unauthenticated"
        ? "Sign in to view this picture."
        : "This picture isn’t available.",
      auth.reason === "unauthenticated" ? 401 : 404,
    );
  }

  const result = await getIssueScreenshotForReview(
    auth.context,
    parsedParams.data.projectId,
    parsedParams.data.reviewId,
    parsedParams.data.issueNumber,
  );

  if (!result.ok) {
    if (result.status === "pending") {
      return unavailableJson("The picture is still being prepared.", 409);
    }
    if (result.status === "failed") {
      return unavailableJson("The picture could not be prepared.", 409);
    }
    return unavailableJson(
      "This issue was saved, but the picture isn’t available.",
      404,
    );
  }

  return privateResponse(new Uint8Array(result.bytes), {
    status: 200,
    headers: {
      "Content-Type": result.mimeType,
      "Content-Length": String(result.bytes.length),
    },
  });
}
