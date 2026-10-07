import "server-only";

import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import { issues, users } from "@/db/schema";
import { ISSUE_ACTIVITY_TYPES } from "@/lib/issues/history";
import { insertIssueActivityEvent } from "@/lib/issues/activity-record";
import {
  dispatchNotifications,
  issueHref,
  loadNotificationContext,
  type CreateNotificationInput,
} from "@/lib/notifications/service";
import { enqueueWebhookEventSafely } from "@/lib/webhooks/enqueue";
import type { WebhookEventType } from "@/lib/webhooks/types";
import { safeVideoEventData } from "@/lib/video/event-data";
import type { VideoFailureReason } from "@/lib/video/failure-reasons";

import type { VideoEventKind } from "@/lib/video/event-data";

export type { VideoEventKind };

type VideoEventInput = {
  kind: VideoEventKind;
  /** Our own record id. Used to make notifications and webhooks safe to repeat. */
  videoAssetId: string;
  workspaceId: string;
  issueId: string;
  /** The person who started the action or the upload. Null when nobody acted. */
  actorUserId: string | null;
  /** Person to tell when processing finishes. Usually the uploader. */
  uploaderUserId?: string | null;
  durationSeconds?: number | null;
  failureReason?: VideoFailureReason | null;
  /** True when the clip took the place of an earlier one. */
  replacedPrevious?: boolean;
  /** When a closed issue's clip will be removed (expiring warnings). */
  retentionEndsAt?: Date | null;
  /** Members to warn about an expiring clip. */
  recipientUserIds?: string[];
};

// A warning that a clip will go soon is not history yet, so it has no history entry.
const ACTIVITY_TYPE: Record<VideoEventKind, string | null> = {
  ready: ISSUE_ACTIVITY_TYPES.VIDEO_ADDED,
  replaced: ISSUE_ACTIVITY_TYPES.VIDEO_REPLACED,
  removed: ISSUE_ACTIVITY_TYPES.VIDEO_REMOVED,
  expired: ISSUE_ACTIVITY_TYPES.VIDEO_EXPIRED,
  expiring: null,
  needs_attention: ISSUE_ACTIVITY_TYPES.VIDEO_NEEDS_ATTENTION,
};

const WEBHOOK_TYPE: Record<VideoEventKind, WebhookEventType> = {
  ready: "issue.video_ready",
  replaced: "issue.video_replaced",
  removed: "issue.video_removed",
  expired: "issue.video_removed",
  expiring: "issue.video_expiring",
  needs_attention: "issue.video_failed",
};

/**
 * Writes the issue history entry, queues webhooks, and notifies people. Each part is
 * best effort: a problem here never changes the video's state.
 */
export async function recordVideoEvent(input: VideoEventInput): Promise<void> {
  try {
    const [issue] = await db
      .select({
        number: issues.number,
        projectId: issues.projectId,
        reviewId: issues.reviewId,
        assigneeUserId: issues.assigneeUserId,
      })
      .from(issues)
      .where(and(eq(issues.id, input.issueId), eq(issues.workspaceId, input.workspaceId)))
      .limit(1);
    if (!issue) return;

    const now = new Date();
    const data = safeVideoEventData(input);

    const activityType = ACTIVITY_TYPE[input.kind];
    if (activityType) {
      await insertIssueActivityEvent(db, {
        workspaceId: input.workspaceId,
        projectId: issue.projectId,
        reviewId: issue.reviewId,
        issueId: input.issueId,
        actorUserId: input.actorUserId,
        type: activityType,
        data,
        createdAt: now,
      }).catch(() => undefined);
    }

    let actorName = "Passoff";
    let actorType: "user" | "system" = "system";
    if (input.actorUserId) {
      const [actor] = await db
        .select({ name: users.name, email: users.email })
        .from(users)
        .where(eq(users.id, input.actorUserId))
        .limit(1);
      actorName = actor?.name?.trim() || "A teammate";
      actorType = "user";
    }

    await enqueueWebhookEventSafely({
      eventId:
        input.kind === "expiring"
          ? `${WEBHOOK_TYPE[input.kind]}:${input.videoAssetId}:${input.retentionEndsAt?.getTime() ?? 0}`
          : input.kind === "expired"
            ? `${WEBHOOK_TYPE[input.kind]}:${input.videoAssetId}:expired`
            : `${WEBHOOK_TYPE[input.kind]}:${input.videoAssetId}`,
      subscribedType: WEBHOOK_TYPE[input.kind],
      eventType: WEBHOOK_TYPE[input.kind],
      occurredAt: now.toISOString(),
      workspaceId: input.workspaceId,
      projectId: issue.projectId,
      reviewId: issue.reviewId,
      issueId: input.issueId,
      issueNumber: issue.number,
      actor: { type: actorType, name: actorName },
      data,
    });

    if (input.kind === "removed" || input.kind === "expired") return;

    const recipients = new Set<string>();
    if (input.kind === "expiring") {
      for (const userId of input.recipientUserIds ?? []) recipients.add(userId);
    } else {
      if (input.uploaderUserId) recipients.add(input.uploaderUserId);
      if (input.kind !== "needs_attention" && issue.assigneeUserId) {
        recipients.add(issue.assigneeUserId);
      }
    }
    if (recipients.size === 0) return;

    const names = await loadNotificationContext(
      input.workspaceId,
      issue.projectId,
      issue.reviewId,
    );
    if (!names) return;

    const type =
      input.kind === "needs_attention"
        ? "issue.video_needs_attention"
        : input.kind === "expiring"
          ? "issue.video_retention_warning"
          : "issue.video_ready";
    const events: CreateNotificationInput[] = [...recipients].map((recipientUserId) => ({
      recipientUserId,
      actorUserId: null,
      workspaceId: input.workspaceId,
      projectId: issue.projectId,
      reviewId: issue.reviewId,
      issueId: input.issueId,
      type,
      dedupeKey:
        input.kind === "expiring"
          ? `${type}:${input.videoAssetId}:${input.retentionEndsAt?.getTime() ?? 0}:${recipientUserId}`
          : `${type}:${input.videoAssetId}:${recipientUserId}`,
      hrefPath: issueHref(issue.projectId, issue.reviewId, issue.number),
      data: {
        workspaceName: names.workspaceName,
        projectName: names.projectName,
        reviewName: names.reviewName,
        actorName: "Passoff",
        issueNumber: issue.number,
        ...(input.kind === "expiring" && input.retentionEndsAt
          ? { retentionEndsAt: input.retentionEndsAt.toISOString() }
          : {}),
      },
    }));
    await dispatchNotifications(events);
  } catch {
    // History, webhooks, and notifications are secondary to the video itself.
  }
}
