"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import {
  cancelApprovalRequest,
  getReviewApprovalStatus,
  requestApproval,
} from "@/lib/approvals/requests";
import { decideApproval } from "@/lib/approvals/service";
import { requireWorkspaceContext } from "@/lib/workspaces/context";

const idSchema = z.string().uuid();

export async function getReviewApprovalStatusAction(input: {
  projectId: string;
  reviewId: string;
}) {
  const auth = await requireWorkspaceContext();
  if (!auth.ok) {
    return { ok: false as const, message: "Sign in to continue." };
  }
  const projectId = idSchema.safeParse(input.projectId);
  const reviewId = idSchema.safeParse(input.reviewId);
  if (!projectId.success || !reviewId.success) {
    return { ok: false as const, message: "This review isn’t available." };
  }

  const status = await getReviewApprovalStatus(
    auth.context.workspaceId,
    reviewId.data,
  );
  if (!status) {
    return { ok: false as const, message: "This review isn’t available." };
  }
  return { ok: true as const, status };
}

export async function requestApprovalAction(input: {
  projectId: string;
  reviewId: string;
  message?: string;
  reviewerUserId?: string | null;
  shareLinkId?: string | null;
  acknowledgeUnresolved: boolean;
}) {
  const auth = await requireWorkspaceContext();
  if (!auth.ok) {
    return { ok: false as const, message: "Sign in to continue." };
  }

  const projectId = idSchema.safeParse(input.projectId);
  const reviewId = idSchema.safeParse(input.reviewId);
  if (!projectId.success || !reviewId.success) {
    return { ok: false as const, message: "This review isn’t available." };
  }

  const result = await requestApproval(auth.context, {
    projectId: projectId.data,
    reviewId: reviewId.data,
    message: input.message,
    reviewerUserId: input.reviewerUserId,
    shareLinkId: input.shareLinkId,
    acknowledgeUnresolved: input.acknowledgeUnresolved,
  });

  if (!result.ok) {
    return { ok: false as const, message: result.message };
  }

  revalidatePath(`/projects/${projectId.data}/reviews/${reviewId.data}`);
  revalidatePath(`/projects/${projectId.data}`);
  return { ok: true as const, requestId: result.requestId };
}

export type DecideApprovalActionResult =
  | { ok: true; message: string }
  | {
      ok: false;
      message: string;
      /** Lets the dialog show a refresh action when the version changed. */
      reason?:
        | "stale_version"
        | "validation"
        | "conflict"
        | "forbidden"
        | "not_found"
        | "unavailable";
    };

export async function decideApprovalAction(input: {
  projectId: string;
  reviewId: string;
  decision: "approved" | "changes_requested";
  note?: string;
  deploymentId?: string | null;
  requestId?: string | null;
}): Promise<DecideApprovalActionResult> {
  const auth = await requireWorkspaceContext();
  if (!auth.ok) {
    return { ok: false, message: "Sign in to continue.", reason: "forbidden" };
  }

  const projectId = idSchema.safeParse(input.projectId);
  const reviewId = idSchema.safeParse(input.reviewId);
  const deploymentId = input.deploymentId
    ? idSchema.safeParse(input.deploymentId)
    : null;
  const requestId = input.requestId ? idSchema.safeParse(input.requestId) : null;
  if (
    !projectId.success ||
    !reviewId.success ||
    (deploymentId && !deploymentId.success) ||
    (requestId && !requestId.success) ||
    (input.decision !== "approved" && input.decision !== "changes_requested")
  ) {
    return { ok: false, message: "This review isn’t available." };
  }

  const result = await decideApproval(auth.context, {
    reviewId: reviewId.data,
    decision: input.decision,
    note: input.note,
    deploymentId: deploymentId?.success ? deploymentId.data : null,
    requestId: requestId?.success ? requestId.data : null,
  });
  if (!result.ok) {
    return { ok: false, message: result.message, reason: result.error };
  }

  revalidatePath(`/projects/${projectId.data}/reviews/${reviewId.data}`);
  revalidatePath(`/projects/${projectId.data}`);
  return {
    ok: true,
    message:
      input.decision === "approved"
        ? "Approval recorded for this version."
        : "Changes requested. The team has been notified.",
  };
}

export async function cancelApprovalRequestAction(input: {
  projectId: string;
  reviewId: string;
  requestId: string;
}) {
  const auth = await requireWorkspaceContext();
  if (!auth.ok) {
    return { ok: false as const, message: "Sign in to continue." };
  }

  const projectId = idSchema.safeParse(input.projectId);
  const reviewId = idSchema.safeParse(input.reviewId);
  const requestId = idSchema.safeParse(input.requestId);
  if (!projectId.success || !reviewId.success || !requestId.success) {
    return { ok: false as const, message: "This approval request isn’t available." };
  }

  const result = await cancelApprovalRequest(auth.context, {
    projectId: projectId.data,
    reviewId: reviewId.data,
    requestId: requestId.data,
  });
  if (!result.ok) {
    return { ok: false as const, message: result.message };
  }

  revalidatePath(`/projects/${projectId.data}/reviews/${reviewId.data}`);
  return { ok: true as const };
}
