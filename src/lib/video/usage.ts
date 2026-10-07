import "server-only";

import { and, eq, gt, gte, inArray, isNull, lte, ne, or, sql, type SQL } from "drizzle-orm";

import { db } from "@/db";
import { videoAssets } from "@/db/schema";
import { resolveWorkspacePlanId } from "@/lib/billing/effective-plan";
import {
  PLAN_ENTITLEMENTS,
  type PlanId,
  type VideoEvidenceLimits,
} from "@/lib/billing/plans";
import { getVideoUsageLevel, resolveVideoEvidenceLimits } from "@/lib/billing/video-evidence";
import {
  VIDEO_UPLOAD_STALE_MS,
  worstUsageLevel,
  type VideoUsageView,
} from "@/lib/video/states";

type Executor = Pick<typeof db, "select">;

export function calendarMonthStart(now: Date) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

/** The plan whose limits apply now. Kept here so video code has one import. */
export { resolveWorkspacePlanId };

export async function resolveWorkspaceVideoLimits(
  executor: Executor,
  workspaceId: string,
): Promise<{ planId: PlanId; limits: VideoEvidenceLimits | null }> {
  const planId = await resolveWorkspacePlanId(executor, workspaceId);
  return {
    planId,
    limits: resolveVideoEvidenceLimits(PLAN_ENTITLEMENTS[planId].videoEvidence),
  };
}

/** Rows that still hold or are about to hold video. Abandoned uploads are left out. */
function liveStatusCondition(now: Date): SQL {
  const staleBefore = new Date(now.getTime() - VIDEO_UPLOAD_STALE_MS);
  return and(
    inArray(videoAssets.processingStatus, ["pending", "uploading", "processing", "ready"]),
    or(
      inArray(videoAssets.processingStatus, ["processing", "ready"]),
      gt(videoAssets.createdAt, staleBefore),
    ),
  ) as SQL;
}

export type WorkspaceVideoUsage = {
  /** New video this calendar month, in seconds. Removing a clip does not give it back. */
  newSeconds: number;
  /** Video currently kept (the clip people see, or one on its way), in seconds. */
  retainedSeconds: number;
};

/**
 * Usage measured in running time. Pass `excludeVideoAssetId` to leave one clip out of
 * both numbers, and `excludeFromRetainedId` to leave one out of retained only (a clip
 * about to be replaced frees its space once the new one is ready).
 */
export async function getWorkspaceVideoUsage(
  executor: Executor,
  workspaceId: string,
  options: {
    now?: Date;
    excludeVideoAssetId?: string;
    excludeFromRetainedId?: string;
  } = {},
): Promise<WorkspaceVideoUsage> {
  const now = options.now ?? new Date();

  const monthlyConditions: SQL[] = [
    eq(videoAssets.workspaceId, workspaceId),
    gte(videoAssets.createdAt, calendarMonthStart(now)),
    lte(videoAssets.createdAt, now),
    liveStatusCondition(now),
  ];
  if (options.excludeVideoAssetId) {
    monthlyConditions.push(ne(videoAssets.id, options.excludeVideoAssetId));
  }

  const retainedConditions: SQL[] = [
    eq(videoAssets.workspaceId, workspaceId),
    inArray(videoAssets.lifecycle, ["current", "replacement"]),
    isNull(videoAssets.providerDeletedAt),
    or(isNull(videoAssets.retentionEndsAt), gt(videoAssets.retentionEndsAt, now)) as SQL,
    liveStatusCondition(now),
  ];
  if (options.excludeVideoAssetId) {
    retainedConditions.push(ne(videoAssets.id, options.excludeVideoAssetId));
  }
  if (options.excludeFromRetainedId) {
    retainedConditions.push(ne(videoAssets.id, options.excludeFromRetainedId));
  }

  const sumMs = sql<number>`coalesce(sum(${videoAssets.durationMs}), 0)`.mapWith(Number);
  const [monthly] = await executor
    .select({ durationMs: sumMs })
    .from(videoAssets)
    .where(and(...monthlyConditions));
  const [retained] = await executor
    .select({ durationMs: sumMs })
    .from(videoAssets)
    .where(and(...retainedConditions));

  return {
    newSeconds: (monthly?.durationMs ?? 0) / 1_000,
    retainedSeconds: (retained?.durationMs ?? 0) / 1_000,
  };
}

/** The numbers people see beside the upload button. Minutes, never provider details. */
export async function getVideoUsageView(
  executor: Executor,
  workspaceId: string,
): Promise<VideoUsageView | null> {
  const { planId, limits } = await resolveWorkspaceVideoLimits(executor, workspaceId);
  if (!limits) return null;
  const usage = await getWorkspaceVideoUsage(executor, workspaceId);
  const newUsed = Math.ceil(usage.newSeconds / 60);
  const retainedUsed = Math.ceil(usage.retainedSeconds / 60);
  return {
    newMinutesUsed: newUsed,
    newMinutesAllowed: limits.newUploadMinutesPerCalendarMonth,
    retainedMinutesUsed: retainedUsed,
    retainedMinutesAllowed: limits.retainedMinutes,
    level: worstUsageLevel(
      getVideoUsageLevel(usage.newSeconds, limits.newUploadMinutesPerCalendarMonth * 60),
      getVideoUsageLevel(usage.retainedSeconds, limits.retainedMinutes * 60),
    ),
    planName: PLAN_ENTITLEMENTS[planId].name,
  };
}
