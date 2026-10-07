import "server-only";

import { and, asc, eq, gt, inArray, isNotNull, isNull, lte, or, sql } from "drizzle-orm";

import { db } from "@/db";
import { assets, issues, videoAssets, workspaceMemberships } from "@/db/schema";
import { VIDEO_EVIDENCE_COMMON_LIMITS } from "@/lib/billing/plans";
import { getVideoEvidenceRetentionEnd } from "@/lib/billing/video-evidence";
import { recordVideoEvent } from "@/lib/video/events";
import { retireVideoRow, type VideoTransaction } from "@/lib/video/lifecycle";
import { deleteProviderCopyNow } from "@/lib/video/provider-deletion";
import { VIDEO_RETENTION_WARNING_DAYS } from "@/lib/video/states";

/**
 * Retention for video evidence.
 *
 * - A clip is kept while its issue is open.
 * - When the issue is closed, the clip is removed 30 days later (the number comes from the
 *   plan limits file). Reopening the issue before then cancels the removal.
 * - Removal keeps the issue, its discussion, screenshots, video notes, and history. The clip's
 *   own record stays as the "video removed" record; only the stored copy is deleted.
 */

export function videoRetentionEnd(closedAt: Date): Date {
  return getVideoEvidenceRetentionEnd(
    closedAt,
    VIDEO_EVIDENCE_COMMON_LIMITS.retentionDaysAfterIssueCloses,
  );
}

/**
 * Sets or clears the removal date on the clips that are in use on an issue. Pass the time the
 * issue closed, or null when it was reopened. Safe to repeat. Runs inside the same
 * transaction as the status change so the two can never disagree.
 */
export async function applyIssueVideoRetention(
  executor: Pick<VideoTransaction, "update">,
  input: { workspaceId: string; issueId: string; closedAt: Date | null; now?: Date },
): Promise<void> {
  const now = input.now ?? new Date();
  await executor
    .update(videoAssets)
    .set({
      retentionEndsAt: input.closedAt ? videoRetentionEnd(input.closedAt) : null,
      updatedAt: now,
    })
    .where(
      and(
        eq(videoAssets.workspaceId, input.workspaceId),
        eq(videoAssets.issueId, input.issueId),
        inArray(videoAssets.lifecycle, ["current", "replacement"]),
      ),
    );
}

/** The removal date a clip arriving now should get: set only when its issue is closed. */
export async function retentionEndForIssue(
  executor: Pick<VideoTransaction, "select">,
  workspaceId: string,
  issueId: string,
): Promise<Date | null> {
  const [issue] = await executor
    .select({ status: issues.status, closedAt: issues.closedAt })
    .from(issues)
    .where(and(eq(issues.id, issueId), eq(issues.workspaceId, workspaceId)))
    .limit(1);
  if (!issue || issue.status !== "closed" || !issue.closedAt) return null;
  return videoRetentionEnd(issue.closedAt);
}

export type RetentionExpirySummary = { expired: number; skipped: number };

type ExpiryOutcome =
  | { kind: "skipped" }
  | {
      kind: "expired";
      issueId: string;
      wasReady: boolean;
      durationMs: number | null;
      uploaderUserId: string | null;
    };

/**
 * Removes clips whose retention period is over. Each clip is handled in its own transaction
 * that first locks the issue, so a person reopening the issue at the same moment either wins
 * (nothing is removed) or loses cleanly (the deadline had already passed). The stored copy
 * is then deleted at the provider right away, and the scheduled deletion job retries any
 * that fail.
 */
export async function expireRetainedVideos(
  options: { limit?: number; now?: Date } = {},
): Promise<RetentionExpirySummary> {
  const now = options.now ?? new Date();
  const candidates = await db
    .select({ id: videoAssets.id, workspaceId: videoAssets.workspaceId, issueId: videoAssets.issueId })
    .from(videoAssets)
    .where(
      and(
        inArray(videoAssets.lifecycle, ["current", "replacement"]),
        isNotNull(videoAssets.retentionEndsAt),
        lte(videoAssets.retentionEndsAt, now),
        isNotNull(videoAssets.issueId),
      ),
    )
    .orderBy(asc(videoAssets.retentionEndsAt))
    .limit(options.limit ?? 25);

  const summary: RetentionExpirySummary = { expired: 0, skipped: 0 };

  for (const candidate of candidates) {
    if (!candidate.issueId) continue;
    const issueId = candidate.issueId;
    try {
      const outcome = await db.transaction(async (tx): Promise<ExpiryOutcome> => {
        const [issue] = await tx
          .select({ status: issues.status })
          .from(issues)
          .where(and(eq(issues.id, issueId), eq(issues.workspaceId, candidate.workspaceId)))
          .for("update");

        const [row] = await tx
          .select({
            id: videoAssets.id,
            workspaceId: videoAssets.workspaceId,
            evidenceId: videoAssets.evidenceId,
            lifecycle: videoAssets.lifecycle,
            processingStatus: videoAssets.processingStatus,
            durationMs: videoAssets.durationMs,
            providerAssetId: videoAssets.providerAssetId,
            providerUploadId: videoAssets.providerUploadId,
            uploadedByUserId: assets.uploadedByUserId,
          })
          .from(videoAssets)
          .leftJoin(assets, eq(assets.id, videoAssets.originalAssetId))
          .where(
            and(
              eq(videoAssets.id, candidate.id),
              inArray(videoAssets.lifecycle, ["current", "replacement"]),
              isNotNull(videoAssets.retentionEndsAt),
              lte(videoAssets.retentionEndsAt, now),
            ),
          )
          .for("update", { of: videoAssets });
        if (!row) return { kind: "skipped" };

        // A deadline on an issue that is no longer closed is stale. Clear it, keep the clip.
        if (!issue || issue.status !== "closed") {
          await tx
            .update(videoAssets)
            .set({ retentionEndsAt: null, updatedAt: now })
            .where(eq(videoAssets.id, row.id));
          return { kind: "skipped" };
        }

        const retired = await retireVideoRow(tx, row, {
          lifecycle: "removed",
          reason: "retention_expired",
          now,
        });
        if (!retired) return { kind: "skipped" };

        // A clip that never finished arriving does not count as kept video any more.
        if (row.processingStatus === "pending" || row.processingStatus === "uploading") {
          await tx
            .update(videoAssets)
            .set({ processingStatus: "failed", failureReason: "upload_failed" })
            .where(eq(videoAssets.id, row.id));
        }

        return {
          kind: "expired",
          issueId,
          wasReady: row.processingStatus === "ready",
          durationMs: row.durationMs,
          uploaderUserId: row.uploadedByUserId,
        };
      });

      if (outcome.kind === "skipped") {
        summary.skipped += 1;
        continue;
      }
      summary.expired += 1;

      if (outcome.wasReady) {
        await recordVideoEvent({
          kind: "expired",
          videoAssetId: candidate.id,
          workspaceId: candidate.workspaceId,
          issueId: outcome.issueId,
          actorUserId: null,
          uploaderUserId: outcome.uploaderUserId,
          durationSeconds: outcome.durationMs == null ? null : outcome.durationMs / 1_000,
        });
      }
      await deleteProviderCopyNow(candidate.id).catch(() => undefined);
    } catch {
      // One clip failing never stops the rest. The next run picks it up again.
      summary.skipped += 1;
    }
  }
  return summary;
}

export type RetentionWarningSummary = { warned: number };

async function listOwnerIds(workspaceId: string): Promise<string[]> {
  const rows = await db
    .select({ userId: workspaceMemberships.userId })
    .from(workspaceMemberships)
    .where(
      and(
        eq(workspaceMemberships.workspaceId, workspaceId),
        eq(workspaceMemberships.status, "active"),
        eq(workspaceMemberships.role, "owner"),
      ),
    );
  return rows.map((row) => row.userId);
}

/**
 * Tells the uploader, the assignee, and the workspace owners that a clip on a closed issue
 * will be removed soon. Each person hears once per removal date: running this again, or a
 * retried job, does not repeat the notice. Reopening the issue and closing it again sets a
 * new date, which earns a new notice.
 */
export async function warnAboutExpiringVideos(
  options: { limit?: number; now?: Date } = {},
): Promise<RetentionWarningSummary> {
  const now = options.now ?? new Date();
  const windowEnd = new Date(now.getTime() + VIDEO_RETENTION_WARNING_DAYS * 24 * 60 * 60 * 1000);

  const rows = await db
    .select({
      id: videoAssets.id,
      workspaceId: videoAssets.workspaceId,
      issueId: videoAssets.issueId,
      retentionEndsAt: videoAssets.retentionEndsAt,
      uploadedByUserId: assets.uploadedByUserId,
      assigneeUserId: issues.assigneeUserId,
    })
    .from(videoAssets)
    .innerJoin(issues, eq(issues.id, videoAssets.issueId))
    .leftJoin(assets, eq(assets.id, videoAssets.originalAssetId))
    .where(
      and(
        eq(videoAssets.lifecycle, "current"),
        eq(videoAssets.processingStatus, "ready"),
        isNull(videoAssets.providerDeletedAt),
        gt(videoAssets.retentionEndsAt, now),
        lte(videoAssets.retentionEndsAt, windowEnd),
        eq(issues.status, "closed"),
        isNull(issues.deletedAt),
        or(
          isNull(videoAssets.retentionWarnedFor),
          sql`${videoAssets.retentionWarnedFor} <> ${videoAssets.retentionEndsAt}`,
        ),
      ),
    )
    .orderBy(asc(videoAssets.retentionEndsAt))
    .limit(options.limit ?? 50);

  let warned = 0;
  for (const row of rows) {
    if (!row.issueId || !row.retentionEndsAt) continue;
    const owners = await listOwnerIds(row.workspaceId);
    const recipients = [
      ...new Set(
        [row.uploadedByUserId, row.assigneeUserId, ...owners].filter(
          (id): id is string => Boolean(id),
        ),
      ),
    ];
    if (recipients.length === 0) continue;
    await recordVideoEvent({
      kind: "expiring",
      videoAssetId: row.id,
      workspaceId: row.workspaceId,
      issueId: row.issueId,
      actorUserId: null,
      retentionEndsAt: row.retentionEndsAt,
      recipientUserIds: recipients,
    });
    await db
      .update(videoAssets)
      .set({ retentionWarnedFor: row.retentionEndsAt })
      .where(
        and(
          eq(videoAssets.id, row.id),
          eq(videoAssets.workspaceId, row.workspaceId),
          eq(videoAssets.retentionEndsAt, row.retentionEndsAt),
        ),
      );
    warned += 1;
  }
  return { warned };
}

/** Everything the video cron job does about retention, in the order that avoids waste. */
export async function runVideoRetention(options: { now?: Date } = {}) {
  const expiry = await expireRetainedVideos({ now: options.now });
  const warnings = await warnAboutExpiringVideos({ now: options.now });
  return { expiry, warnings };
}
