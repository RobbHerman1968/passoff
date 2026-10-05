"use server";

import { revalidatePath } from "next/cache";

import type { IssueHistoryEvent } from "@/lib/issues/history";
import {
  listIssueHistorySchema,
  updateIssueAssigneeSchema,
  updateIssuePrioritySchema,
  updateIssueStatusSchema,
} from "@/lib/issues/schemas";
import {
  listIssueHistory,
  updateIssueTriageAssignee,
  updateIssueTriagePriority,
  updateIssueTriageStatus,
  type TriageServiceError,
} from "@/lib/issues/triage";
import type { IssueTriageSnapshot } from "@/lib/issues/triage-types";
import { issueDetailPath, reviewIssuesPath } from "@/lib/issues/url";
import {
  requireWorkspaceContext,
  type WorkspaceContext,
} from "@/lib/workspaces/context";

export type IssueTriageActionResult =
  | {
      ok: true;
      issue: IssueTriageSnapshot;
      event: IssueHistoryEvent;
    }
  | {
      ok: false;
      error: TriageServiceError | "unauthenticated";
      message: string;
    };

export type IssueHistoryActionResult =
  | { ok: true; events: IssueHistoryEvent[] }
  | {
      ok: false;
      error: "not_found" | "unavailable" | "unauthenticated";
      message: string;
    };

function revalidateIssueViews(
  projectId: string,
  reviewId: string,
  issueNumber: number,
) {
  revalidatePath(reviewIssuesPath(projectId, reviewId));
  revalidatePath(issueDetailPath(projectId, reviewId, issueNumber));
}

async function requireTriageContext(): Promise<
  | { ok: true; context: WorkspaceContext }
  | { ok: false; result: IssueTriageActionResult }
> {
  const auth = await requireWorkspaceContext();
  if (!auth.ok) {
    return {
      ok: false,
      result: {
        ok: false,
        error: auth.reason === "unauthenticated" ? "unauthenticated" : "not_found",
        message:
          auth.reason === "unauthenticated"
            ? "Sign in to continue."
            : "This issue isn’t available.",
      },
    };
  }
  return { ok: true, context: auth.context };
}

function toActionResult(
  result: Awaited<ReturnType<typeof updateIssueTriageStatus>>,
  loc: { projectId: string; reviewId: string; issueNumber: number },
): IssueTriageActionResult {
  if (!result.ok) {
    return {
      ok: false,
      error: result.error,
      message: result.message,
    };
  }
  revalidateIssueViews(loc.projectId, loc.reviewId, loc.issueNumber);
  return { ok: true, issue: result.issue, event: result.event };
}

export async function updateIssueStatusAction(
  input: unknown,
): Promise<IssueTriageActionResult> {
  const auth = await requireTriageContext();
  if (!auth.ok) return auth.result;

  const parsed = updateIssueStatusSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: "validation",
      message: "Check this update and try again.",
    };
  }

  const result = await updateIssueTriageStatus(auth.context, parsed.data);
  return toActionResult(result, parsed.data);
}

export async function updateIssuePriorityAction(
  input: unknown,
): Promise<IssueTriageActionResult> {
  const auth = await requireTriageContext();
  if (!auth.ok) return auth.result;

  const parsed = updateIssuePrioritySchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: "validation",
      message: "Check this update and try again.",
    };
  }

  const result = await updateIssueTriagePriority(auth.context, parsed.data);
  return toActionResult(result, parsed.data);
}

export async function updateIssueAssigneeAction(
  input: unknown,
): Promise<IssueTriageActionResult> {
  const auth = await requireTriageContext();
  if (!auth.ok) return auth.result;

  const parsed = updateIssueAssigneeSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: "validation",
      message: "Choose someone in this workspace, or Unassigned.",
    };
  }

  const result = await updateIssueTriageAssignee(auth.context, parsed.data);
  return toActionResult(result, parsed.data);
}

export async function listIssueHistoryAction(
  input: unknown,
): Promise<IssueHistoryActionResult> {
  const auth = await requireWorkspaceContext();
  if (!auth.ok) {
    return {
      ok: false,
      error: auth.reason === "unauthenticated" ? "unauthenticated" : "not_found",
      message:
        auth.reason === "unauthenticated"
          ? "Sign in to continue."
          : "This issue isn’t available.",
    };
  }

  const parsed = listIssueHistorySchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: "not_found",
      message: "This issue isn’t available.",
    };
  }

  try {
    const events = await listIssueHistory(auth.context, parsed.data);
    if (!events) {
      return {
        ok: false,
        error: "not_found",
        message: "This issue isn’t available.",
      };
    }
    return { ok: true, events };
  } catch {
    return {
      ok: false,
      error: "unavailable",
      message: "We couldn’t load history. Try again.",
    };
  }
}
