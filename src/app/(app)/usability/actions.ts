"use server";

import { revalidatePath } from "next/cache";

import {
  analyzeFinding,
  attachFindingToIssue,
  createIssueFromFinding,
  requestBehavioralComparison,
  searchIssuesForFinding,
  suggestIssuesForFinding,
  updateFindingDisposition,
} from "@/lib/findings/service";
import type { BehavioralFindingDisposition } from "@/db/schema";
import type { IssuePriority } from "@/lib/issues/statuses";
import { requireWorkspaceContext } from "@/lib/workspaces/context";

export type FindingActionResult = {
  status: "ok" | "error";
  message?: string;
  href?: string;
  issueNumber?: number;
};

async function authOrError() {
  const auth = await requireWorkspaceContext();
  if (!auth.ok) {
    return { ok: false as const, message: "Sign in to continue." };
  }
  return { ok: true as const, context: auth.context };
}

export async function createIssueFromFindingAction(input: {
  findingId: string;
  reviewId: string;
  title: string;
  description: string;
  priority: IssuePriority;
  assigneeUserId: string | null;
  includeInvestigationSteps: boolean;
  investigationSteps: string[];
  confirmed: boolean;
}): Promise<FindingActionResult> {
  const auth = await authOrError();
  if (!auth.ok) return { status: "error", message: auth.message };
  const result = await createIssueFromFinding(auth.context, input);
  if (!result.ok) return { status: "error", message: result.message };
  revalidatePath("/usability");
  return {
    status: "ok",
    href: result.issue.href,
    issueNumber: result.issue.number,
    message: result.issue.existing
      ? `Issue #${result.issue.number} is already linked.`
      : `Issue #${result.issue.number} was created.`,
  };
}

export async function attachFindingToIssueAction(input: {
  findingId: string;
  issueId: string;
  confirmed: boolean;
}): Promise<FindingActionResult> {
  const auth = await authOrError();
  if (!auth.ok) return { status: "error", message: auth.message };
  const result = await attachFindingToIssue(auth.context, input);
  if (!result.ok) return { status: "error", message: result.message };
  revalidatePath("/usability");
  return {
    status: "ok",
    message: result.existing
      ? "That evidence is already attached."
      : "Behavioral evidence was attached to the issue.",
  };
}

export async function searchFindingIssuesAction(input: {
  findingId: string;
  query: string;
}) {
  const auth = await authOrError();
  if (!auth.ok) return { status: "error" as const, message: auth.message, items: [] };
  const items = input.query.trim()
    ? await searchIssuesForFinding(auth.context, input.findingId, input.query)
    : await suggestIssuesForFinding(auth.context, input.findingId);
  return { status: "ok" as const, items };
}

export async function updateFindingDispositionAction(input: {
  findingId: string;
  disposition: BehavioralFindingDisposition;
}): Promise<FindingActionResult> {
  const auth = await authOrError();
  if (!auth.ok) return { status: "error", message: auth.message };
  const result = await updateFindingDisposition(
    auth.context,
    input.findingId,
    input.disposition,
  );
  if (!result.ok) return { status: "error", message: result.message };
  revalidatePath("/usability");
  return { status: "ok", message: "Finding updated." };
}

export async function analyzeFindingAction(findingId: string): Promise<FindingActionResult> {
  const auth = await authOrError();
  if (!auth.ok) return { status: "error", message: auth.message };
  const result = await analyzeFinding(auth.context, findingId);
  revalidatePath("/usability");
  if (!result.ok) return { status: "error", message: result.message };
  return { status: "ok", message: result.reused ? "Showing the latest analysis." : "Analysis ready." };
}

export async function requestComparisonAction(input: {
  issueId: string;
  snapshotId: string;
  comparisonVersion: string;
  viewportGroup: "mobile" | "tablet" | "desktop";
  metricName: string;
}): Promise<FindingActionResult> {
  const auth = await authOrError();
  if (!auth.ok) return { status: "error", message: auth.message };
  const result = await requestBehavioralComparison(auth.context, input);
  if (!result.ok) return { status: "error", message: result.message };
  revalidatePath("/usability");
  return { status: "ok", message: "Comparison requested. This never verifies or closes the issue by itself." };
}
