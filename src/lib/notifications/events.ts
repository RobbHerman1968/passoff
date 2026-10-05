import "server-only";

import { and, eq, isNull, sql } from "drizzle-orm";

import { db } from "@/db";
import { deployments, issues, reviews } from "@/db/schema";
import { OPEN_ISSUE_STATUSES } from "@/lib/issues/statuses";
import {
  actorLabel,
  dispatchNotifications,
  issueHref,
  listActiveWorkspaceMemberIds,
  loadNotificationContext,
  reviewHref,
  type CreateNotificationInput,
} from "@/lib/notifications/service";
import type { NotificationPayload } from "@/lib/notifications/types";
import type { WorkspaceContext } from "@/lib/workspaces/context";

async function payloadFor(
  workspaceId: string,
  projectId: string,
  reviewId: string,
  actorName: string,
  extra: Partial<NotificationPayload> = {},
): Promise<NotificationPayload | null> {
  const names = await loadNotificationContext(workspaceId, projectId, reviewId);
  if (!names) return null;
  return {
    workspaceName: names.workspaceName,
    projectName: names.projectName,
    reviewName: names.reviewName,
    actorName,
    versionLabel: names.versionLabel || extra.versionLabel,
    ...extra,
  };
}

export async function notifyIssueAssigned(input: {
  context: WorkspaceContext;
  projectId: string;
  reviewId: string;
  issueId: string;
  issueNumber: number;
  issueVersion: number;
  assigneeUserId: string;
}): Promise<void> {
  const data = await payloadFor(
    input.context.workspaceId,
    input.projectId,
    input.reviewId,
    actorLabel(input.context),
    { issueNumber: input.issueNumber },
  );
  if (!data) return;
  await dispatchNotifications([
    {
      recipientUserId: input.assigneeUserId,
      actorUserId: input.context.userId,
      workspaceId: input.context.workspaceId,
      projectId: input.projectId,
      reviewId: input.reviewId,
      issueId: input.issueId,
      type: "issue.assigned",
      dedupeKey: `issue.assigned:${input.issueId}:${input.assigneeUserId}:${input.issueVersion}`,
      hrefPath: issueHref(input.projectId, input.reviewId, input.issueNumber),
      data,
    },
  ]);
}

export async function notifyIssueStatusChanged(input: {
  context: WorkspaceContext;
  projectId: string;
  reviewId: string;
  issueId: string;
  issueNumber: number;
  issueVersion: number;
  fromStatus: string;
  toStatus: string;
  assigneeUserId: string | null;
}): Promise<void> {
  const data = await payloadFor(
    input.context.workspaceId,
    input.projectId,
    input.reviewId,
    actorLabel(input.context),
    { issueNumber: input.issueNumber },
  );
  if (!data) return;

  const events: CreateNotificationInput[] = [];
  const href = issueHref(input.projectId, input.reviewId, input.issueNumber);

  if (
    input.toStatus !== "ready_for_verification" &&
    input.assigneeUserId &&
    input.assigneeUserId !== input.context.userId
  ) {
    events.push({
      recipientUserId: input.assigneeUserId,
      actorUserId: input.context.userId,
      workspaceId: input.context.workspaceId,
      projectId: input.projectId,
      reviewId: input.reviewId,
      issueId: input.issueId,
      type: "issue.status_changed",
      dedupeKey: `issue.status_changed:${input.issueId}:${input.fromStatus}:${input.toStatus}:${input.issueVersion}`,
      hrefPath: href,
      data,
    });
  }

  if (input.toStatus === "ready_for_verification") {
    const members = await listActiveWorkspaceMemberIds(
      input.context.workspaceId,
      input.context.userId,
    );
    for (const recipientUserId of members) {
      events.push({
        recipientUserId,
        actorUserId: input.context.userId,
        workspaceId: input.context.workspaceId,
        projectId: input.projectId,
        reviewId: input.reviewId,
        issueId: input.issueId,
        type: "issue.ready_for_verification",
        dedupeKey: `issue.ready_for_verification:${input.issueId}:${recipientUserId}:${input.issueVersion}`,
        hrefPath: href,
        data,
      });
    }
  }

  await dispatchNotifications(events);
}

export async function notifyIssueComment(input: {
  context: WorkspaceContext;
  projectId: string;
  reviewId: string;
  issueId: string;
  issueNumber: number;
  commentId: string;
  issueAuthorUserId: string | null;
  mentionedUserIds?: string[];
}): Promise<void> {
  const data = await payloadFor(
    input.context.workspaceId,
    input.projectId,
    input.reviewId,
    actorLabel(input.context),
    { issueNumber: input.issueNumber },
  );
  if (!data) return;

  const members = new Set(
    await listActiveWorkspaceMemberIds(input.context.workspaceId, input.context.userId),
  );
  const events: CreateNotificationInput[] = [];
  const href = issueHref(input.projectId, input.reviewId, input.issueNumber);

  if (input.issueAuthorUserId && members.has(input.issueAuthorUserId)) {
    events.push({
      recipientUserId: input.issueAuthorUserId,
      actorUserId: input.context.userId,
      workspaceId: input.context.workspaceId,
      projectId: input.projectId,
      reviewId: input.reviewId,
      issueId: input.issueId,
      type: "issue.comment_replied",
      dedupeKey: `issue.comment_replied:${input.commentId}:${input.issueAuthorUserId}`,
      hrefPath: href,
      data,
    });
  }

  for (const mentionedUserId of input.mentionedUserIds ?? []) {
    if (!members.has(mentionedUserId)) continue;
    events.push({
      recipientUserId: mentionedUserId,
      actorUserId: input.context.userId,
      workspaceId: input.context.workspaceId,
      projectId: input.projectId,
      reviewId: input.reviewId,
      issueId: input.issueId,
      type: "issue.mentioned",
      dedupeKey: `issue.mentioned:${input.commentId}:${mentionedUserId}`,
      hrefPath: href,
      data,
    });
  }

  await dispatchNotifications(events);
}

export async function notifyVerificationRecorded(input: {
  context: WorkspaceContext;
  projectId: string;
  reviewId: string;
  issueId: string;
  issueNumber: number;
  verificationId: string;
  outcome: "passed" | "failed" | "uncertain";
  assigneeUserId: string | null;
}): Promise<void> {
  if (input.outcome === "uncertain") return;
  const data = await payloadFor(
    input.context.workspaceId,
    input.projectId,
    input.reviewId,
    actorLabel(input.context),
    { issueNumber: input.issueNumber },
  );
  if (!data) return;

  const events: CreateNotificationInput[] = [];
  const href = issueHref(input.projectId, input.reviewId, input.issueNumber);
  const type =
    input.outcome === "passed"
      ? "issue.verification_passed"
      : "issue.verification_failed";

  if (input.assigneeUserId && input.assigneeUserId !== input.context.userId) {
    events.push({
      recipientUserId: input.assigneeUserId,
      actorUserId: input.context.userId,
      workspaceId: input.context.workspaceId,
      projectId: input.projectId,
      reviewId: input.reviewId,
      issueId: input.issueId,
      type,
      dedupeKey: `${type}:${input.verificationId}:${input.assigneeUserId}`,
      hrefPath: href,
      data,
    });
  }

  await dispatchNotifications(events);

  if (input.outcome === "passed") {
    await notifyReviewReadyForApprovalIfClear(input);
  }
}

async function notifyReviewReadyForApprovalIfClear(input: {
  context: WorkspaceContext;
  projectId: string;
  reviewId: string;
  issueId: string;
}): Promise<void> {
  const [open] = await db
    .select({ total: sql<number>`count(*)`.mapWith(Number) })
    .from(issues)
    .where(
      and(
        eq(issues.reviewId, input.reviewId),
        eq(issues.workspaceId, input.context.workspaceId),
        isNull(issues.deletedAt),
        sql`${issues.status}::text in (${sql.join(
          OPEN_ISSUE_STATUSES.map((status) => sql`${status}`),
          sql`, `,
        )})`,
      ),
    );

  if ((open?.total ?? 0) > 0) return;

  const data = await payloadFor(
    input.context.workspaceId,
    input.projectId,
    input.reviewId,
    actorLabel(input.context),
  );
  if (!data) return;

  const members = await listActiveWorkspaceMemberIds(
    input.context.workspaceId,
    input.context.userId,
  );
  await dispatchNotifications(
    members.map((recipientUserId) => ({
      recipientUserId,
      actorUserId: input.context.userId,
      workspaceId: input.context.workspaceId,
      projectId: input.projectId,
      reviewId: input.reviewId,
      issueId: input.issueId,
      type: "review.ready_for_approval",
      dedupeKey: `review.ready_for_approval:${input.reviewId}:${input.issueId}`,
      hrefPath: reviewHref(input.projectId, input.reviewId),
      data,
    })),
  );
}

export async function notifyApprovalRecorded(input: {
  context: WorkspaceContext;
  projectId: string;
  reviewId: string;
  approvalId: string;
  decision: "approved" | "changes_requested";
}): Promise<void> {
  const [deployment] = await db
    .select({ identifier: deployments.identifier })
    .from(reviews)
    .innerJoin(deployments, eq(deployments.id, reviews.deploymentId))
    .where(
      and(
        eq(reviews.id, input.reviewId),
        eq(reviews.workspaceId, input.context.workspaceId),
      ),
    )
    .limit(1);

  const data = await payloadFor(
    input.context.workspaceId,
    input.projectId,
    input.reviewId,
    actorLabel(input.context),
    { versionLabel: deployment?.identifier },
  );
  if (!data) return;

  const members = await listActiveWorkspaceMemberIds(
    input.context.workspaceId,
    input.context.userId,
  );
  const type =
    input.decision === "approved" ? "review.approved" : "review.changes_requested";

  await dispatchNotifications(
    members.map((recipientUserId) => ({
      recipientUserId,
      actorUserId: input.context.userId,
      workspaceId: input.context.workspaceId,
      projectId: input.projectId,
      reviewId: input.reviewId,
      issueId: null,
      type,
      dedupeKey: `${type}:${input.approvalId}:${recipientUserId}`,
      hrefPath: reviewHref(input.projectId, input.reviewId),
      data,
    })),
  );
}
