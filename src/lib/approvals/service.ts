import "server-only";

import { and, desc, eq, isNull } from "drizzle-orm";

import { db } from "@/db";
import {
  approvalRequests,
  approvals,
  guestIdentities,
  projects,
  reviews,
  shareLinks,
} from "@/db/schema";
import { issueSummaryForReview } from "@/lib/approvals/requests";
import {
  validateApprovalNote,
  type ApprovalDecision,
} from "@/lib/approvals/types";
import {
  notifyApprovalRecorded,
  notifyGuestApprovalRecorded,
} from "@/lib/notifications/events";
import { actorLabel } from "@/lib/notifications/service";
import { canMutateProjects } from "@/lib/projects/permissions";
import type { SdkSession } from "@/lib/sdk/session";
import { enqueueWebhookEventSafely } from "@/lib/webhooks/enqueue";
import type { WorkspaceContext } from "@/lib/workspaces/context";

export type ServiceError = "forbidden" | "not_found" | "conflict" | "unavailable";

export type DecideApprovalError =
  | "forbidden"
  | "not_found"
  | "validation"
  | "conflict"
  | "stale_version"
  | "unavailable";

export type DecideApprovalResult =
  | {
      ok: true;
      approvalId: string;
      requestId: string | null;
      /** True when a newer version has been recorded since this approval. */
      historical: boolean;
    }
  | { ok: false; error: DecideApprovalError; message: string };

/**
 * What a guest decision needs to know about who is deciding. A review-website session
 * satisfies this, and so does a share link opened on the Passoff page.
 */
export type GuestApprovalScope = Pick<
  SdkSession,
  "workspaceId" | "reviewId" | "shareLinkId" | "guestIdentityId" | "canApprove"
>;

export type DecideApprovalInput = {
  reviewId: string;
  decision: ApprovalDecision;
  /** Required when requesting changes. Optional for approvals. */
  note?: string | null;
  /** The version the person was looking at. Rejects the decision if it changed. */
  deploymentId?: string | null;
  /** A specific request to resolve. Omit to resolve whichever request is waiting. */
  requestId?: string | null;
};

type DecisionActor =
  | { kind: "user"; userId: string; workspaceId: string }
  | {
      kind: "guest";
      guestId: string;
      guestName: string;
      shareLinkId: string;
      workspaceId: string;
    };

const failure = (
  error: DecideApprovalError,
  message: string,
): { ok: false; error: DecideApprovalError; message: string } => ({
  ok: false,
  error,
  message,
});

async function decideInTransaction(
  actor: DecisionActor,
  input: DecideApprovalInput,
  note: string | null,
) {
  return db.transaction(async (tx) => {
    // Lock the review so two simultaneous decisions cannot both resolve one request.
    const [review] = await tx
      .select({
        id: reviews.id,
        workspaceId: reviews.workspaceId,
        projectId: reviews.projectId,
        environmentId: reviews.environmentId,
        deploymentId: reviews.deploymentId,
        archivedAt: reviews.archivedAt,
        projectStatus: projects.status,
      })
      .from(reviews)
      .innerJoin(projects, eq(projects.id, reviews.projectId))
      .where(
        and(
          eq(reviews.id, input.reviewId),
          eq(reviews.workspaceId, actor.workspaceId),
          isNull(projects.deletedAt),
        ),
      )
      .limit(1)
      .for("update", { of: reviews });

    if (!review) {
      return failure("not_found", "This review isn’t available.");
    }
    if (review.archivedAt || review.projectStatus === "archived") {
      return failure("validation", "Archived reviews can’t be approved.");
    }
    if (input.deploymentId && input.deploymentId !== review.deploymentId) {
      return failure(
        "stale_version",
        "The site now runs a newer version. Reload to see it before deciding.",
      );
    }

    const [waiting] = await tx
      .select({
        id: approvalRequests.id,
        shareLinkId: approvalRequests.shareLinkId,
        reviewerUserId: approvalRequests.reviewerUserId,
      })
      .from(approvalRequests)
      .where(
        and(
          eq(approvalRequests.reviewId, review.id),
          eq(approvalRequests.workspaceId, review.workspaceId),
          eq(approvalRequests.deploymentId, review.deploymentId),
          eq(approvalRequests.state, "awaiting_decision"),
        ),
      )
      .limit(1);

    if (input.requestId && waiting?.id !== input.requestId) {
      return failure(
        "conflict",
        "That approval request isn’t waiting for a decision anymore.",
      );
    }

    if (actor.kind === "guest") {
      const [link] = await tx
        .select({
          canApprove: shareLinks.canApprove,
          revokedAt: shareLinks.revokedAt,
          expiresAt: shareLinks.expiresAt,
        })
        .from(shareLinks)
        .where(
          and(
            eq(shareLinks.id, actor.shareLinkId),
            eq(shareLinks.reviewId, review.id),
            eq(shareLinks.workspaceId, review.workspaceId),
          ),
        )
        .limit(1);

      if (!link || link.revokedAt || (link.expiresAt && link.expiresAt <= new Date())) {
        return failure(
          "forbidden",
          "This review link isn’t active anymore. Ask the team for a new link.",
        );
      }
      if (!link.canApprove) {
        return failure(
          "forbidden",
          "This link lets you view and comment, but not approve. Ask the team for an approval link.",
        );
      }
      if (!waiting) {
        return failure(
          "conflict",
          "The team hasn’t asked for approval on this version yet.",
        );
      }
      const forAnotherLink =
        (waiting.shareLinkId && waiting.shareLinkId !== actor.shareLinkId) ||
        (!waiting.shareLinkId && waiting.reviewerUserId);
      if (forAnotherLink) {
        return failure(
          "forbidden",
          "This approval request was sent to someone else.",
        );
      }
    }

    const reviewerMatch =
      actor.kind === "user"
        ? eq(approvals.reviewerUserId, actor.userId)
        : eq(approvals.reviewerGuestId, actor.guestId);

    const existing = await tx
      .select({ id: approvals.id, decision: approvals.decision })
      .from(approvals)
      .where(
        and(
          eq(approvals.reviewId, review.id),
          eq(approvals.deploymentId, review.deploymentId),
          eq(approvals.workspaceId, review.workspaceId),
          reviewerMatch,
          isNull(approvals.invalidatedAt),
        ),
      );

    if (!waiting && existing.some((row) => row.decision === input.decision)) {
      return failure(
        "conflict",
        input.decision === "approved"
          ? "You already approved this version."
          : "You already asked for changes on this version.",
      );
    }

    const now = new Date();
    // A person can change their mind: older active decisions stay on record but stop counting.
    for (const row of existing) {
      await tx
        .update(approvals)
        .set({ invalidatedAt: now })
        .where(eq(approvals.id, row.id));
    }

    const [approval] = await tx
      .insert(approvals)
      .values({
        workspaceId: review.workspaceId,
        projectId: review.projectId,
        environmentId: review.environmentId,
        deploymentId: review.deploymentId,
        reviewId: review.id,
        reviewerUserId: actor.kind === "user" ? actor.userId : null,
        reviewerGuestId: actor.kind === "guest" ? actor.guestId : null,
        decision: input.decision,
        note,
      })
      .returning({ id: approvals.id, deploymentId: approvals.deploymentId });

    let resolvedRequestId: string | null = null;
    if (waiting) {
      const [resolved] = await tx
        .update(approvalRequests)
        .set({
          state: input.decision,
          completedAt: now,
          decisionApprovalId: approval.id,
          updatedAt: now,
        })
        .where(
          and(
            eq(approvalRequests.id, waiting.id),
            eq(approvalRequests.state, "awaiting_decision"),
          ),
        )
        .returning({ id: approvalRequests.id });
      resolvedRequestId = resolved?.id ?? null;
    } else if (actor.kind === "user") {
      // A teammate decided without a request. Keep a completed record so status and
      // history read the same way as requested approvals.
      const summary = await issueSummaryForReview(review.workspaceId, review.id);
      const [direct] = await tx
        .insert(approvalRequests)
        .values({
          workspaceId: review.workspaceId,
          projectId: review.projectId,
          environmentId: review.environmentId,
          reviewId: review.id,
          deploymentId: review.deploymentId,
          requestedByUserId: actor.userId,
          reviewerUserId: actor.userId,
          state: input.decision,
          completedAt: now,
          decisionApprovalId: approval.id,
          openIssueCount: summary.openIssueCount,
          awaitingVerificationCount: summary.awaitingVerificationCount,
          verifiedIssueCount: summary.verifiedIssueCount,
          createdAt: now,
          updatedAt: now,
        })
        .returning({ id: approvalRequests.id });
      resolvedRequestId = direct.id;
    }

    return {
      ok: true as const,
      approvalId: approval.id,
      requestId: resolvedRequestId,
      historical: false,
      projectId: review.projectId,
      deploymentId: approval.deploymentId,
    };
  });
}

async function afterDecision(
  actor: DecisionActor,
  input: DecideApprovalInput,
  result: {
    approvalId: string;
    requestId: string | null;
    projectId: string;
    deploymentId: string;
  },
  actorName: string,
  context: WorkspaceContext | null,
) {
  // Notifications must never undo a recorded decision.
  try {
    if (actor.kind === "user" && context) {
      await notifyApprovalRecorded({
        context,
        projectId: result.projectId,
        reviewId: input.reviewId,
        approvalId: result.approvalId,
        decision: input.decision,
      });
    } else if (actor.kind === "guest") {
      await notifyGuestApprovalRecorded({
        workspaceId: actor.workspaceId,
        guestName: actorName,
        projectId: result.projectId,
        reviewId: input.reviewId,
        approvalId: result.approvalId,
        decision: input.decision,
      });
    }
  } catch {
    // The decision is already saved.
  }

  const eventType =
    input.decision === "approved" ? "review.approved" : "review.changes_requested";
  await enqueueWebhookEventSafely({
    eventId: result.approvalId,
    subscribedType: eventType,
    eventType,
    occurredAt: new Date().toISOString(),
    workspaceId: actor.workspaceId,
    projectId: result.projectId,
    reviewId: input.reviewId,
    issueId: null,
    issueNumber: null,
    actor: {
      type: actor.kind === "user" ? "user" : "guest",
      name: actorName,
    },
    data: {
      decision: input.decision,
      deploymentId: result.deploymentId,
      requestId: result.requestId,
    },
  });
}

function mapDecisionError(error: unknown): DecideApprovalResult {
  if (
    error &&
    typeof error === "object" &&
    "code" in error &&
    error.code === "23505"
  ) {
    return failure("conflict", "That decision was already recorded for this version.");
  }
  return failure(
    "unavailable",
    "We couldn’t save that decision. Your note is still here. Try again.",
  );
}

/** A teammate approves or requests changes on the review’s current version. */
export async function decideApproval(
  context: WorkspaceContext,
  input: DecideApprovalInput,
): Promise<DecideApprovalResult> {
  if (!canMutateProjects(context)) {
    return failure("forbidden", "You don’t have permission to decide on this review.");
  }
  const checked = validateApprovalNote(input.decision, input.note);
  if (!checked.ok) return failure("validation", checked.message);

  const actor: DecisionActor = {
    kind: "user",
    userId: context.userId,
    workspaceId: context.workspaceId,
  };

  try {
    const result = await decideInTransaction(actor, input, checked.note);
    if (!result.ok) return result;
    await afterDecision(actor, input, result, actorLabel(context), context);
    return {
      ok: true,
      approvalId: result.approvalId,
      requestId: result.requestId,
      historical: result.historical,
    };
  } catch (error) {
    return mapDecisionError(error);
  }
}

/**
 * A guest decides through a share-link session. The session must belong to this exact
 * review, its link must still allow approval, and the decision applies to the review’s
 * current version only.
 */
export async function decideGuestApproval(
  session: GuestApprovalScope,
  input: Omit<DecideApprovalInput, "reviewId">,
): Promise<DecideApprovalResult> {
  if (!session.canApprove) {
    return failure(
      "forbidden",
      "This link lets you view and comment, but not approve. Ask the team for an approval link.",
    );
  }
  const checked = validateApprovalNote(input.decision, input.note);
  if (!checked.ok) return failure("validation", checked.message);

  const [guest] = await db
    .select({ id: guestIdentities.id, name: guestIdentities.name })
    .from(guestIdentities)
    .where(
      and(
        eq(guestIdentities.id, session.guestIdentityId),
        eq(guestIdentities.workspaceId, session.workspaceId),
      ),
    )
    .limit(1);
  if (!guest) {
    return failure("forbidden", "Open the review link again to continue.");
  }

  const actor: DecisionActor = {
    kind: "guest",
    guestId: guest.id,
    guestName: guest.name,
    shareLinkId: session.shareLinkId,
    workspaceId: session.workspaceId,
  };
  const scoped: DecideApprovalInput = { ...input, reviewId: session.reviewId };

  try {
    const result = await decideInTransaction(actor, scoped, checked.note);
    if (!result.ok) return result;
    await afterDecision(actor, scoped, result, guest.name, null);
    return {
      ok: true,
      approvalId: result.approvalId,
      requestId: result.requestId,
      historical: result.historical,
    };
  } catch (error) {
    return mapDecisionError(error);
  }
}

/** Kept for existing callers. Prefer `decideApproval`. */
export async function recordApproval(
  context: WorkspaceContext,
  input: { reviewId: string; decision: ApprovalDecision; note?: string },
): Promise<
  | { ok: true; approvalId: string; historical: boolean }
  | { ok: false; error: ServiceError }
> {
  const result = await decideApproval(context, input);
  if (result.ok) {
    return { ok: true, approvalId: result.approvalId, historical: result.historical };
  }
  const error: ServiceError =
    result.error === "forbidden"
      ? "forbidden"
      : result.error === "not_found"
        ? "not_found"
        : result.error === "unavailable"
          ? "unavailable"
          : "conflict";
  return { ok: false, error };
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
    )
    .orderBy(desc(approvals.createdAt));
}
