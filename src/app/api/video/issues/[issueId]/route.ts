import { NextResponse } from "next/server";
import { z } from "zod";

import { getIssueVideoViewById } from "@/lib/video/issue-video";
import { requireWorkspaceContext } from "@/lib/workspaces/context";

export const runtime = "nodejs";

const paramsSchema = z.object({ issueId: z.uuid() });

function privateJson(body: Record<string, unknown>, status: number) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
}

/**
 * Where an issue's video stands, for the page to check while a clip is uploading or being
 * prepared. Workspace members only; it returns plain-language state, never provider details.
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ issueId: string }> },
) {
  const parsed = paramsSchema.safeParse(await context.params);
  if (!parsed.success) {
    return privateJson({ ok: false, message: "This issue isn’t available." }, 404);
  }

  const auth = await requireWorkspaceContext();
  if (!auth.ok) {
    return privateJson(
      {
        ok: false,
        message:
          auth.reason === "unauthenticated"
            ? "Sign in to see this video."
            : "This issue isn’t available.",
      },
      auth.reason === "unauthenticated" ? 401 : 403,
    );
  }

  try {
    const view = await getIssueVideoViewById(auth.context, parsed.data.issueId);
    if (!view) {
      return privateJson({ ok: false, message: "This issue isn’t available." }, 404);
    }
    return privateJson({ ok: true, view }, 200);
  } catch {
    return privateJson(
      { ok: false, message: "We couldn’t check on this video. Try again." },
      503,
    );
  }
}
