"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { ISSUE_COMMENT_MAX_LENGTH } from "@/lib/comments/limits";
import { createIssueComment } from "@/lib/comments/service";
import type { IssueCommentView } from "@/lib/comments/types";
import { issueDetailPath } from "@/lib/issues/url";
import { requireWorkspaceContext } from "@/lib/workspaces/context";

const createIssueCommentSchema = z.object({
  projectId: z.string().uuid(),
  reviewId: z.string().uuid(),
  issueNumber: z.number().int().positive(),
  body: z.string().max(ISSUE_COMMENT_MAX_LENGTH + 1_000),
  visibility: z.enum(["public", "private"]).default("public"),
  mentionedUserIds: z.array(z.string().uuid()).max(20).default([]),
});

export type CreateIssueCommentActionResult =
  | { ok: true; comment: IssueCommentView }
  | {
      ok: false;
      error:
        | "unauthenticated"
        | "forbidden"
        | "not_found"
        | "validation"
        | "rate_limited"
        | "unavailable";
      message: string;
    };

const FALLBACK_MESSAGE = "We couldn’t save that reply. Your text is still here. Try again.";

export async function createIssueCommentAction(input: {
  projectId: string;
  reviewId: string;
  issueNumber: number;
  body: string;
  visibility?: "public" | "private";
  mentionedUserIds?: string[];
}): Promise<CreateIssueCommentActionResult> {
  const auth = await requireWorkspaceContext();
  if (!auth.ok) {
    return {
      ok: false,
      error: "unauthenticated",
      message: "Sign in to continue.",
    };
  }

  const parsed = createIssueCommentSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: "validation",
      message: "Check your reply and try again.",
    };
  }

  const result = await createIssueComment(auth.context, parsed.data);
  if (!result.ok) {
    if (result.error === "forbidden") {
      return {
        ok: false,
        error: "forbidden",
        message: "You don’t have permission to reply to this issue.",
      };
    }
    if (result.error === "not_found") {
      return {
        ok: false,
        error: "not_found",
        message: "This issue isn’t available anymore.",
      };
    }
    if (result.error === "validation") {
      return {
        ok: false,
        error: "validation",
        message: result.message ?? "Check your reply and try again.",
      };
    }
    return {
      ok: false,
      error: result.error === "rate_limited" ? "rate_limited" : "unavailable",
      message: result.message ?? FALLBACK_MESSAGE,
    };
  }

  revalidatePath(
    issueDetailPath(
      parsed.data.projectId,
      parsed.data.reviewId,
      parsed.data.issueNumber,
    ),
  );
  return { ok: true, comment: result.comment };
}
