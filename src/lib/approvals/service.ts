import "server-only";

import { and, desc, eq } from "drizzle-orm";

import { db } from "@/db";
import { approvals, deployments, reviews } from "@/db/schema";
import { notifyApprovalRecorded } from "@/lib/notifications/events";
import { actorLabel } from "@/lib/notifications/service";
import { canMutateProjects } from "@/lib/projects/permissions";
import { enqueueWebhookEventSafely } from "@/lib/webhooks/enqueue";
import type { WorkspaceContext } from "@/lib/workspaces/context";

export type ServiceError = "forbidden" | "not_found" | "conflict" | "unavailable";

export async function recordApproval(
  context: WorkspaceContext,
  input: {
    reviewId: string;
    decision: "approved" | "changes_requested";
    note?: string;
  },
): Promise<
  | { ok: true; approvalId: string; historical: boolean }
  | { ok: false; error: ServiceError }
> {
  if (!canMutateProjects(context)) {
    return { ok: false, error: "forbidden" };
  }

  try {
    const result = await db.transaction(async (tx) => {
      const [review] = await tx
        .select({
          id: reviews.id,
          workspaceId: reviews.workspaceId,
          projectId: reviews.projectId,
          environmentId: reviews.environmentId,
          deploymentId: reviews.deploymentId,
        })
        .from(reviews)
        .where(
          and(
            eq(reviews.id, input.reviewId),
            eq(reviews.workspaceId, context.workspaceId),
          ),
        )
        .limit(1);

      if (!review) {
        return { ok: false as const, error: "not_found" as const };
      }

      const [approval] = await tx
        .insert(approvals)
        .values({
          workspaceId: review.workspaceId,
          projectId: review.projectId,
          environmentId: review.environmentId,
          deploymentId: review.deploymentId,
          reviewId: review.id,
          reviewerUserId: context.userId,
          decision: input.decision,
          note: input.note,
        })
        .returning({ id: approvals.id, deploymentId: approvals.deploymentId });

      const [latest] = await tx
        .select({ id: deployments.id })
        .from(deployments)
        .where(
          and(
            eq(deployments.environmentId, review.environmentId),
            eq(deployments.workspaceId, context.workspaceId),
          ),
        )
        .orderBy(desc(deployments.recordedAt))
        .limit(1);

      return {
        ok: true as const,
        approvalId: approval.id,
        historical: Boolean(latest && latest.id !== approval.deploymentId),
        projectId: review.projectId,
      };
    });

    if (result.ok) {
      try {
        await notifyApprovalRecorded({
          context,
          projectId: result.projectId,
          reviewId: input.reviewId,
          approvalId: result.approvalId,
          decision: input.decision,
        });
      } catch {
        // Keep the approval even if notifying fails.
      }
      await enqueueWebhookEventSafely({
        eventId: result.approvalId,
        subscribedType:
          input.decision === "approved"
            ? "review.approval_recorded"
            : "review.changes_requested",
        eventType:
          input.decision === "approved"
            ? "review.approval_recorded"
            : "review.changes_requested",
        occurredAt: new Date().toISOString(),
        workspaceId: context.workspaceId,
        projectId: result.projectId,
        reviewId: input.reviewId,
        issueId: null,
        issueNumber: null,
        actor: { type: "user", name: actorLabel(context) },
        data: { decision: input.decision },
      });
      return {
        ok: true,
        approvalId: result.approvalId,
        historical: result.historical,
      };
    }

    return result;
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "23505"
    ) {
      return { ok: false, error: "conflict" };
    }
    return { ok: false, error: "unavailable" };
  }
}

export async function listApprovalsForReview(
  context: WorkspaceContext,
  reviewId: string,
) {
  return db
    .select({
      id: approvals.id,
      deploymentId: approvals.deploymentId,
      decision: approvals.decision,
      createdAt: approvals.createdAt,
      invalidatedAt: approvals.invalidatedAt,
    })
    .from(approvals)
    .where(
      and(
        eq(approvals.reviewId, reviewId),
        eq(approvals.workspaceId, context.workspaceId),
      ),
    );
}
