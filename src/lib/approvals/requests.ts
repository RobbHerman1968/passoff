import "server-only";

import { and, count, desc, eq, inArray, isNull } from "drizzle-orm";

import { db } from "@/db";
import {
  approvalRequests,
  approvals,
  deployments,
  guestIdentities,
  issues,
  projectEnvironments,
  projects,
  reviews,
  shareLinks,
  users,
} from "@/db/schema";
import type {
  ApprovalRequestView,
  ApprovalReviewerOption,
  GuestApprovalOffer,
  IssueApprovalSummary,
  ReviewApprovalSummary,
  ReviewApprovalStatusView,
} from "@/lib/approvals/types";
import { deriveApprovalVisibleState } from "@/lib/approvals/status";
import { OPEN_ISSUE_STATUSES } from "@/lib/issues/statuses";
import {
  actorLabel,
  dispatchNotifications,
  listActiveWorkspaceMemberIds,
  loadNotificationContext,
  reviewHref,
} from "@/lib/notifications/service";
import { canMutateProjects } from "@/lib/projects/permissions";
import type { SdkSession } from "@/lib/sdk/session";
import { personDisplayName } from "@/lib/users/display-name";
import { enqueueWebhookEventSafely } from "@/lib/webhooks/enqueue";
import type { WorkspaceContext } from "@/lib/workspaces/context";

export type ApprovalRequestError =
  | "forbidden"
  | "not_found"
  | "validation"
  | "conflict"
  | "unavailable"
  | "approval_disabled";

export async function issueSummaryForReview(
  workspaceId: string,
  reviewId: string,
): Promise<IssueApprovalSummary> {
  const rows = await db
    .select({
      status: issues.status,
      total: count(),
    })
    .from(issues)
    .where(
      and(
        eq(issues.workspaceId, workspaceId),
        eq(issues.reviewId, reviewId),
        isNull(issues.deletedAt),
      ),
    )
    .groupBy(issues.status);

  let openIssueCount = 0;
  let awaitingVerificationCount = 0;
  let verifiedIssueCount = 0;
  for (const row of rows) {
    if ((OPEN_ISSUE_STATUSES as readonly string[]).includes(row.status)) {
      openIssueCount += row.total;
    }
    if (row.status === "ready_for_verification") {
      awaitingVerificationCount += row.total;
    }
    if (row.status === "verified") {
      verifiedIssueCount += row.total;
    }
  }

  return {
    openIssueCount,
    awaitingVerificationCount,
    verifiedIssueCount,
    failedVerificationCount: 0,
  };
}

function toRequestView(input: {
  id: string;
  state: ApprovalRequestView["state"];
  deploymentId: string;
  versionLabel: string | null;
  environmentName: string | null;
  recordedAt: Date | null;
  message: string | null;
  dueAt: Date | null;
  createdAt: Date;
  completedAt: Date | null;
  cancelledAt: Date | null;
  unresolvedAcknowledged: boolean;
  openIssueCount: number;
  awaitingVerificationCount: number;
  verifiedIssueCount: number;
  requesterName: string | null;
  requesterEmail: string | null;
  reviewerName: string | null;
  reviewerEmail: string | null;
  decisionNote: string | null;
  decisionUserName: string | null;
  decisionUserEmail: string | null;
  decisionGuestName: string | null;
  currentDeploymentId: string;
}): ApprovalRequestView {
  return {
    id: input.id,
    state: input.state,
    deploymentId: input.deploymentId,
    versionLabel: input.versionLabel?.trim() || "Recorded version",
    environmentName: input.environmentName?.trim() || "Environment",
    recordedAt: input.recordedAt?.toISOString() ?? null,
    message: input.message,
    dueAt: input.dueAt?.toISOString() ?? null,
    requestedAt: input.createdAt.toISOString(),
    completedAt: input.completedAt?.toISOString() ?? null,
    cancelledAt: input.cancelledAt?.toISOString() ?? null,
    unresolvedAcknowledged: input.unresolvedAcknowledged,
    openIssueCount: input.openIssueCount,
    awaitingVerificationCount: input.awaitingVerificationCount,
    verifiedIssueCount: input.verifiedIssueCount,
    requesterDisplayName: personDisplayName(input.requesterName, input.requesterEmail),
    reviewerDisplayName:
      input.reviewerName || input.reviewerEmail
        ? personDisplayName(input.reviewerName, input.reviewerEmail)
        : null,
    decisionNote: input.decisionNote,
    decidedByDisplayName: input.decisionGuestName
      ? input.decisionGuestName
      : input.decisionUserName || input.decisionUserEmail
        ? personDisplayName(input.decisionUserName, input.decisionUserEmail)
        : null,
    historical: input.deploymentId !== input.currentDeploymentId,
  };
}

export async function getReviewApprovalStatus(
  workspaceId: string,
  reviewId: string,
): Promise<ReviewApprovalStatusView | null> {
  const [review] = await db
    .select({
      id: reviews.id,
      projectId: reviews.projectId,
      deploymentId: reviews.deploymentId,
      feedbackDeadline: reviews.feedbackDeadline,
      versionLabel: deployments.displayLabel,
      recordedAt: deployments.recordedAt,
      environmentName: projectEnvironments.name,
    })
    .from(reviews)
    .innerJoin(deployments, eq(deployments.id, reviews.deploymentId))
    .innerJoin(
      projectEnvironments,
      eq(projectEnvironments.id, reviews.environmentId),
    )
    .where(and(eq(reviews.id, reviewId), eq(reviews.workspaceId, workspaceId)))
    .limit(1);
  if (!review) return null;

  const summary = await issueSummaryForReview(workspaceId, review.id);
  const requester = db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
    })
    .from(users)
    .as("approval_requester");
  const reviewer = db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
    })
    .from(users)
    .as("approval_reviewer");
  const decisionUser = db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
    })
    .from(users)
    .as("approval_decision_user");

  const rows = await db
    .select({
      id: approvalRequests.id,
      state: approvalRequests.state,
      deploymentId: approvalRequests.deploymentId,
      message: approvalRequests.message,
      dueAt: approvalRequests.dueAt,
      createdAt: approvalRequests.createdAt,
      completedAt: approvalRequests.completedAt,
      cancelledAt: approvalRequests.cancelledAt,
      unresolvedAcknowledged: approvalRequests.unresolvedAcknowledged,
      openIssueCount: approvalRequests.openIssueCount,
      awaitingVerificationCount: approvalRequests.awaitingVerificationCount,
      verifiedIssueCount: approvalRequests.verifiedIssueCount,
      versionLabel: deployments.displayLabel,
      recordedAt: deployments.recordedAt,
      environmentName: projectEnvironments.name,
      requesterName: requester.name,
      requesterEmail: requester.email,
      reviewerName: reviewer.name,
      reviewerEmail: reviewer.email,
      decisionNote: approvals.note,
      decisionUserName: decisionUser.name,
      decisionUserEmail: decisionUser.email,
      decisionGuestName: guestIdentities.name,
    })
    .from(approvalRequests)
    .innerJoin(deployments, eq(deployments.id, approvalRequests.deploymentId))
    .innerJoin(
      projectEnvironments,
      eq(projectEnvironments.id, approvalRequests.environmentId),
    )
    .leftJoin(requester, eq(requester.id, approvalRequests.requestedByUserId))
    .leftJoin(reviewer, eq(reviewer.id, approvalRequests.reviewerUserId))
    .leftJoin(approvals, eq(approvals.id, approvalRequests.decisionApprovalId))
    .leftJoin(decisionUser, eq(decisionUser.id, approvals.reviewerUserId))
    .leftJoin(guestIdentities, eq(guestIdentities.id, approvals.reviewerGuestId))
    .where(
      and(
        eq(approvalRequests.reviewId, review.id),
        eq(approvalRequests.workspaceId, workspaceId),
      ),
    )
    .orderBy(desc(approvalRequests.createdAt));

  const history = rows.map((row) =>
    toRequestView({
      ...row,
      currentDeploymentId: review.deploymentId,
    }),
  );
  const activeRequest =
    history.find(
      (row) =>
        row.state === "awaiting_decision" &&
        row.deploymentId === review.deploymentId,
    ) ?? null;

  const visibleState = deriveApprovalVisibleState(history, review.deploymentId);

  return {
    visibleState,
    currentDeploymentId: review.deploymentId,
    currentVersionLabel: review.versionLabel?.trim() || "Recorded version",
    currentRecordedAt: review.recordedAt?.toISOString() ?? null,
    environmentName: review.environmentName?.trim() || "Environment",
    activeRequest,
    history,
    issueSummary: summary,
    feedbackDeadline: review.feedbackDeadline?.toISOString() ?? null,
  };
}

export async function requestApproval(
  context: WorkspaceContext,
  input: {
    projectId: string;
    reviewId: string;
    message?: string;
    reviewerUserId?: string | null;
    shareLinkId?: string | null;
    acknowledgeUnresolved: boolean;
  },
): Promise<
  | { ok: true; requestId: string }
  | { ok: false; error: ApprovalRequestError; message: string }
> {
  if (!canMutateProjects(context)) {
    return {
      ok: false,
      error: "forbidden",
      message: "You don’t have permission to request approval.",
    };
  }

  const message = input.message?.trim() || null;
  if (message && message.length > 2_000) {
    return {
      ok: false,
      error: "validation",
      message: "Keep the message under 2,000 characters.",
    };
  }

  try {
    const created = await db.transaction(async (tx) => {
      const [review] = await tx
        .select({
          id: reviews.id,
          workspaceId: reviews.workspaceId,
          projectId: reviews.projectId,
          environmentId: reviews.environmentId,
          deploymentId: reviews.deploymentId,
          feedbackDeadline: reviews.feedbackDeadline,
          archivedAt: reviews.archivedAt,
          projectStatus: projects.status,
          versionLabel: deployments.displayLabel,
        })
        .from(reviews)
        .innerJoin(projects, eq(projects.id, reviews.projectId))
        .innerJoin(deployments, eq(deployments.id, reviews.deploymentId))
        .where(
          and(
            eq(reviews.id, input.reviewId),
            eq(reviews.projectId, input.projectId),
            eq(reviews.workspaceId, context.workspaceId),
            isNull(projects.deletedAt),
          ),
        )
        .limit(1);

      if (!review) {
        return { ok: false as const, error: "not_found" as const };
      }
      if (review.archivedAt || review.projectStatus === "archived") {
        return {
          ok: false as const,
          error: "validation" as const,
          message: "Archived reviews can’t receive approval requests.",
        };
      }

      const summary = await issueSummaryForReview(review.workspaceId, review.id);
      const hasUnresolved =
        summary.openIssueCount > 0 || summary.awaitingVerificationCount > 0;
      if (hasUnresolved && !input.acknowledgeUnresolved) {
        return {
          ok: false as const,
          error: "validation" as const,
          message:
            "Confirm that you understand open or unverified issues remain before requesting approval.",
        };
      }

      if (input.shareLinkId) {
        const [link] = await tx
          .select({
            id: shareLinks.id,
            canApprove: shareLinks.canApprove,
            revokedAt: shareLinks.revokedAt,
          })
          .from(shareLinks)
          .where(
            and(
              eq(shareLinks.id, input.shareLinkId),
              eq(shareLinks.reviewId, review.id),
              eq(shareLinks.workspaceId, context.workspaceId),
            ),
          )
          .limit(1);
        if (!link || link.revokedAt) {
          return {
            ok: false as const,
            error: "validation" as const,
            message: "Choose an active guest link that can approve.",
          };
        }
        if (!link.canApprove) {
          return {
            ok: false as const,
            error: "validation" as const,
            message: "That guest link can’t approve. Create one with approval permission.",
          };
        }
      }

      if (input.reviewerUserId) {
        const members = await listActiveWorkspaceMemberIds(context.workspaceId);
        if (!members.includes(input.reviewerUserId)) {
          return {
            ok: false as const,
            error: "validation" as const,
            message: "Choose an active teammate as the reviewer.",
          };
        }
      }

      const pending = await tx
        .select({ id: approvalRequests.id })
        .from(approvalRequests)
        .where(
          and(
            eq(approvalRequests.reviewId, review.id),
            eq(approvalRequests.workspaceId, context.workspaceId),
            eq(approvalRequests.state, "awaiting_decision"),
          ),
        );

      const now = new Date();
      const [request] = await tx
        .insert(approvalRequests)
        .values({
          workspaceId: review.workspaceId,
          projectId: review.projectId,
          environmentId: review.environmentId,
          reviewId: review.id,
          deploymentId: review.deploymentId,
          requestedByUserId: context.userId,
          reviewerUserId: input.reviewerUserId ?? null,
          shareLinkId: input.shareLinkId ?? null,
          message,
          state: "awaiting_decision",
          dueAt: review.feedbackDeadline,
          openIssueCount: summary.openIssueCount,
          awaitingVerificationCount: summary.awaitingVerificationCount,
          verifiedIssueCount: summary.verifiedIssueCount,
          unresolvedAcknowledged: hasUnresolved ? input.acknowledgeUnresolved : false,
          createdAt: now,
          updatedAt: now,
        })
        .returning({ id: approvalRequests.id });

      const supersededIds: string[] = [];
      for (const row of pending) {
        if (row.id === request.id) continue;
        await tx
          .update(approvalRequests)
          .set({
            state: "superseded",
            supersededByRequestId: request.id,
            updatedAt: now,
          })
          .where(eq(approvalRequests.id, row.id));
        supersededIds.push(row.id);
      }

      return {
        ok: true as const,
        requestId: request.id,
        review,
        summary,
        supersededIds,
        versionLabel: review.versionLabel,
      };
    });

    if (!created.ok) {
      return {
        ok: false,
        error: created.error,
        message:
          "message" in created && created.message
            ? created.message
            : "This review isn’t available.",
      };
    }

    try {
      const names = await loadNotificationContext(
        context.workspaceId,
        created.review.projectId,
        created.review.id,
      );
      if (names) {
        const recipients = new Set<string>();
        const members = await listActiveWorkspaceMemberIds(
          context.workspaceId,
          context.userId,
        );
        if (input.reviewerUserId) recipients.add(input.reviewerUserId);
        else for (const id of members) recipients.add(id);

        await dispatchNotifications(
          [...recipients].map((recipientUserId) => ({
            recipientUserId,
            actorUserId: context.userId,
            workspaceId: context.workspaceId,
            projectId: created.review.projectId,
            reviewId: created.review.id,
            issueId: null,
            type: "review.approval_requested" as const,
            dedupeKey: `review.approval_requested:${created.requestId}:${recipientUserId}`,
            hrefPath: reviewHref(created.review.projectId, created.review.id),
            data: {
              workspaceName: names.workspaceName,
              projectName: names.projectName,
              reviewName: names.reviewName,
              actorName: actorLabel(context),
              versionLabel: created.versionLabel ?? undefined,
            },
          })),
        );

        for (const supersededId of created.supersededIds) {
          await dispatchNotifications(
            [...recipients].map((recipientUserId) => ({
              recipientUserId,
              actorUserId: context.userId,
              workspaceId: context.workspaceId,
              projectId: created.review.projectId,
              reviewId: created.review.id,
              issueId: null,
              type: "review.approval_superseded" as const,
              dedupeKey: `review.approval_superseded:${supersededId}:${created.requestId}:${recipientUserId}`,
              hrefPath: reviewHref(created.review.projectId, created.review.id),
              data: {
                workspaceName: names.workspaceName,
                projectName: names.projectName,
                reviewName: names.reviewName,
                actorName: actorLabel(context),
                versionLabel: created.versionLabel ?? undefined,
              },
            })),
          );
        }
      }
    } catch {
      // Keep the request even if notifying fails.
    }

    await enqueueWebhookEventSafely({
      eventId: created.requestId,
      subscribedType: "review.approval_requested",
      eventType: "review.approval_requested",
      occurredAt: new Date().toISOString(),
      workspaceId: context.workspaceId,
      projectId: created.review.projectId,
      reviewId: created.review.id,
      issueId: null,
      issueNumber: null,
      actor: { type: "user", name: actorLabel(context) },
      data: {
        deploymentId: created.review.deploymentId,
        versionLabel: created.versionLabel,
        state: "awaiting_decision",
      },
    });

    for (const supersededId of created.supersededIds) {
      await enqueueWebhookEventSafely({
        eventId: supersededId,
        subscribedType: "review.approval_superseded",
        eventType: "review.approval_superseded",
        occurredAt: new Date().toISOString(),
        workspaceId: context.workspaceId,
        projectId: created.review.projectId,
        reviewId: created.review.id,
        issueId: null,
        issueNumber: null,
        actor: { type: "user", name: actorLabel(context) },
        data: {
          supersededByRequestId: created.requestId,
          deploymentId: created.review.deploymentId,
        },
      });
    }

    return { ok: true, requestId: created.requestId };
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "23505"
    ) {
      return {
        ok: false,
        error: "conflict",
        message: "An approval request is already waiting for this version.",
      };
    }
    return {
      ok: false,
      error: "unavailable",
      message: "We couldn’t send that approval request. Try again.",
    };
  }
}

export async function cancelApprovalRequest(
  context: WorkspaceContext,
  input: { projectId: string; reviewId: string; requestId: string },
): Promise<
  | { ok: true }
  | { ok: false; error: ApprovalRequestError; message: string }
> {
  if (!canMutateProjects(context)) {
    return {
      ok: false,
      error: "forbidden",
      message: "You don’t have permission to cancel this request.",
    };
  }

  try {
    const now = new Date();
    const [updated] = await db
      .update(approvalRequests)
      .set({
        state: "cancelled",
        cancelledAt: now,
        updatedAt: now,
      })
      .where(
        and(
          eq(approvalRequests.id, input.requestId),
          eq(approvalRequests.reviewId, input.reviewId),
          eq(approvalRequests.projectId, input.projectId),
          eq(approvalRequests.workspaceId, context.workspaceId),
          eq(approvalRequests.state, "awaiting_decision"),
        ),
      )
      .returning({
        id: approvalRequests.id,
        deploymentId: approvalRequests.deploymentId,
      });

    if (!updated) {
      return {
        ok: false,
        error: "not_found",
        message: "That approval request isn’t waiting for a decision anymore.",
      };
    }

    try {
      const names = await loadNotificationContext(
        context.workspaceId,
        input.projectId,
        input.reviewId,
      );
      if (names) {
        const members = await listActiveWorkspaceMemberIds(
          context.workspaceId,
          context.userId,
        );
        await dispatchNotifications(
          members.map((recipientUserId) => ({
            recipientUserId,
            actorUserId: context.userId,
            workspaceId: context.workspaceId,
            projectId: input.projectId,
            reviewId: input.reviewId,
            issueId: null,
            type: "review.approval_cancelled" as const,
            dedupeKey: `review.approval_cancelled:${updated.id}:${recipientUserId}`,
            hrefPath: reviewHref(input.projectId, input.reviewId),
            data: {
              workspaceName: names.workspaceName,
              projectName: names.projectName,
              reviewName: names.reviewName,
              actorName: actorLabel(context),
            },
          })),
        );
      }
    } catch {
      // Keep cancellation.
    }

    await enqueueWebhookEventSafely({
      eventId: updated.id,
      subscribedType: "review.approval_cancelled",
      eventType: "review.approval_cancelled",
      occurredAt: now.toISOString(),
      workspaceId: context.workspaceId,
      projectId: input.projectId,
      reviewId: input.reviewId,
      issueId: null,
      issueNumber: null,
      actor: { type: "user", name: actorLabel(context) },
      data: { deploymentId: updated.deploymentId, state: "cancelled" },
    });

    return { ok: true };
  } catch {
    return {
      ok: false,
      error: "unavailable",
      message: "We couldn’t cancel that request. Try again.",
    };
  }
}

/** Guest-safe summary: never includes private notes or private attachment hints. */
export async function getGuestApprovalStatus(
  session: Pick<SdkSession, "workspaceId" | "reviewId">,
): Promise<ReviewApprovalStatusView | null> {
  const status = await getReviewApprovalStatus(
    session.workspaceId,
    session.reviewId,
  );
  if (!status) return null;
  return {
    ...status,
    history: status.history.map((row) => ({
      ...row,
      // Guests never see decision notes that may contain private discussion.
      decisionNote: null,
      decidedByDisplayName: null,
      reviewerDisplayName: null,
    })),
  };
}

/**
 * One query for every review in a list. Returns a map keyed by review id.
 * Reviews with no approval history map to "not_requested".
 */
export async function listReviewApprovalSummaries(
  workspaceId: string,
  reviewIds: readonly string[],
): Promise<Map<string, ReviewApprovalSummary>> {
  const result = new Map<string, ReviewApprovalSummary>();
  if (reviewIds.length === 0) return result;

  const reviewRows = await db
    .select({
      id: reviews.id,
      deploymentId: reviews.deploymentId,
      versionLabel: deployments.displayLabel,
    })
    .from(reviews)
    .innerJoin(deployments, eq(deployments.id, reviews.deploymentId))
    .where(
      and(eq(reviews.workspaceId, workspaceId), inArray(reviews.id, [...reviewIds])),
    );

  const requestRows = await db
    .select({
      reviewId: approvalRequests.reviewId,
      state: approvalRequests.state,
      deploymentId: approvalRequests.deploymentId,
      completedAt: approvalRequests.completedAt,
      versionLabel: deployments.displayLabel,
      note: approvals.note,
      userName: users.name,
      userEmail: users.email,
      guestName: guestIdentities.name,
    })
    .from(approvalRequests)
    .innerJoin(deployments, eq(deployments.id, approvalRequests.deploymentId))
    .leftJoin(approvals, eq(approvals.id, approvalRequests.decisionApprovalId))
    .leftJoin(users, eq(users.id, approvals.reviewerUserId))
    .leftJoin(guestIdentities, eq(guestIdentities.id, approvals.reviewerGuestId))
    .where(
      and(
        eq(approvalRequests.workspaceId, workspaceId),
        inArray(approvalRequests.reviewId, [...reviewIds]),
      ),
    )
    .orderBy(desc(approvalRequests.createdAt));

  const byReview = new Map<string, typeof requestRows>();
  for (const row of requestRows) {
    const list = byReview.get(row.reviewId) ?? [];
    list.push(row);
    byReview.set(row.reviewId, list);
  }

  for (const review of reviewRows) {
    const history = byReview.get(review.id) ?? [];
    const visibleState = deriveApprovalVisibleState(history, review.deploymentId);
    const approved = history.find((row) => row.state === "approved");
    // Decision details must match the state people see, never an older decision.
    const decisionRow =
      visibleState === "changes_requested"
        ? history.find(
            (row) =>
              row.state === "changes_requested" &&
              row.deploymentId === review.deploymentId,
          )
        : visibleState === "approved" || visibleState === "historical_approval"
          ? approved
          : undefined;
    const decidedBy = decisionRow
      ? (decisionRow.guestName ??
        (decisionRow.userName || decisionRow.userEmail
          ? personDisplayName(decisionRow.userName, decisionRow.userEmail)
          : null))
      : null;
    result.set(review.id, {
      visibleState,
      currentVersionLabel: review.versionLabel?.trim() || "Recorded version",
      approvedVersionLabel: approved
        ? approved.versionLabel?.trim() || "Recorded version"
        : null,
      approvedAt: decisionRow?.completedAt?.toISOString() ?? null,
      approvedByDisplayName: decidedBy,
      decisionNote: decisionRow?.note ?? null,
    });
  }
  return result;
}

/** Teammates who can be named as the reviewer on an approval request. */
export async function listApprovalReviewerOptions(
  context: WorkspaceContext,
): Promise<ApprovalReviewerOption[]> {
  const ids = await listActiveWorkspaceMemberIds(context.workspaceId);
  if (ids.length === 0) return [];
  const rows = await db
    .select({ id: users.id, name: users.name, email: users.email })
    .from(users)
    .where(inArray(users.id, ids));
  return rows
    .map((row) => ({
      userId: row.id,
      displayName:
        row.id === context.userId
          ? "Me"
          : personDisplayName(row.name, row.email),
    }))
    .sort((a, b) => a.displayName.localeCompare(b.displayName));
}

/**
 * What a guest link can do about approval right now. Mirrors the rules enforced when a
 * decision is saved, so the page never offers a button the server would refuse.
 */
export async function getGuestApprovalOffer(
  link: { workspaceId: string; reviewId: string; shareLinkId: string; canApprove: boolean },
): Promise<GuestApprovalOffer | null> {
  const status = await getGuestApprovalStatus(link);
  if (!status) return null;

  if (!link.canApprove) {
    return { status, canDecide: false, blockedReason: "view_only" };
  }

  const [waiting] = await db
    .select({
      id: approvalRequests.id,
      shareLinkId: approvalRequests.shareLinkId,
      reviewerUserId: approvalRequests.reviewerUserId,
    })
    .from(approvalRequests)
    .innerJoin(reviews, eq(reviews.id, approvalRequests.reviewId))
    .where(
      and(
        eq(approvalRequests.reviewId, link.reviewId),
        eq(approvalRequests.workspaceId, link.workspaceId),
        eq(approvalRequests.deploymentId, reviews.deploymentId),
        eq(approvalRequests.state, "awaiting_decision"),
      ),
    )
    .limit(1);

  if (!waiting) {
    const decided =
      status.visibleState === "approved" || status.visibleState === "changes_requested";
    return {
      status,
      canDecide: false,
      blockedReason: decided ? "already_decided" : "no_request",
    };
  }
  const someoneElse =
    (waiting.shareLinkId && waiting.shareLinkId !== link.shareLinkId) ||
    (!waiting.shareLinkId && waiting.reviewerUserId);
  if (someoneElse) {
    return { status, canDecide: false, blockedReason: "someone_else" };
  }
  return { status, canDecide: true, blockedReason: null };
}
