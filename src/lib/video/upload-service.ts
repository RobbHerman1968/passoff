import "server-only";

import { randomUUID } from "node:crypto";

import { and, eq, gt, gte, inArray, isNull, or, sql } from "drizzle-orm";

import { db } from "@/db";
import {
  assets,
  issueEvidence,
  issues,
  subscriptions,
  videoAssets,
} from "@/db/schema";
import { PLAN_ENTITLEMENTS, PLAN_IDS, type PlanId } from "@/lib/billing/plans";
import { checkVideoEvidenceUpload } from "@/lib/billing/video-evidence";
import { canMutateProjects } from "@/lib/projects/permissions";
import type { WorkspaceContext } from "@/lib/workspaces/context";

export type VideoUploadReservationInput = {
  issueId: string;
  fileName: string;
  mimeType: string;
  fileBytes: number;
  durationSeconds: number;
};

export type VideoUploadReservation = {
  evidenceId: string;
  originalAssetId: string;
  videoAssetId: string;
  reviewId: string;
};

function isPlanId(value: string): value is PlanId {
  return (PLAN_IDS as readonly string[]).includes(value);
}

function calendarMonthStart(now: Date) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

export async function prepareVideoUploadReservation(
  context: WorkspaceContext,
  input: VideoUploadReservationInput,
): Promise<
  | { ok: true; reservation: VideoUploadReservation }
  | { ok: false; status: 400 | 403 | 404 | 409; message: string }
> {
  if (!canMutateProjects(context)) {
    return {
      ok: false,
      status: 403,
      message: "You don’t have permission to add video evidence.",
    };
  }

  const now = new Date();
  const [issue, subscription, uploadedUsage, retainedUsage] = await Promise.all([
    db
      .select({ id: issues.id, reviewId: issues.reviewId, status: issues.status })
      .from(issues)
      .where(
        and(
          eq(issues.id, input.issueId),
          eq(issues.workspaceId, context.workspaceId),
          isNull(issues.deletedAt),
        ),
      )
      .limit(1)
      .then((rows) => rows[0] ?? null),
    db
      .select({ plan: subscriptions.plan })
      .from(subscriptions)
      .where(
        and(
          eq(subscriptions.workspaceId, context.workspaceId),
          inArray(subscriptions.status, ["trialing", "active"]),
        ),
      )
      .limit(1)
      .then((rows) => rows[0] ?? null),
    db
      .select({
        durationMs: sql<number>`coalesce(sum(${videoAssets.durationMs}), 0)`.mapWith(Number),
      })
      .from(videoAssets)
      .where(
        and(
          eq(videoAssets.workspaceId, context.workspaceId),
          gte(videoAssets.createdAt, calendarMonthStart(now)),
        ),
      )
      .then((rows) => rows[0]?.durationMs ?? 0),
    db
      .select({
        durationMs: sql<number>`coalesce(sum(${videoAssets.durationMs}), 0)`.mapWith(Number),
      })
      .from(videoAssets)
      .where(
        and(
          eq(videoAssets.workspaceId, context.workspaceId),
          or(isNull(videoAssets.retentionEndsAt), gt(videoAssets.retentionEndsAt, now)),
        ),
      )
      .then((rows) => rows[0]?.durationMs ?? 0),
  ]);

  if (!issue) {
    return {
      ok: false,
      status: 404,
      message: "This issue is no longer available.",
    };
  }
  if (issue.status === "closed") {
    return {
      ok: false,
      status: 409,
      message: "Reopen this issue before adding video evidence.",
    };
  }

  const planId = subscription && isPlanId(subscription.plan) ? subscription.plan : "free";
  const allowance = checkVideoEvidenceUpload(PLAN_ENTITLEMENTS[planId].videoEvidence, {
    durationSeconds: input.durationSeconds,
    fileBytes: input.fileBytes,
    uploadedSecondsThisMonth: uploadedUsage / 1_000,
    retainedSeconds: retainedUsage / 1_000,
  });
  if (!allowance.allowed) {
    return { ok: false, status: 400, message: allowance.message };
  }

  return {
    ok: true,
    reservation: {
      evidenceId: randomUUID(),
      originalAssetId: randomUUID(),
      videoAssetId: randomUUID(),
      reviewId: issue.reviewId,
    },
  };
}

export async function saveVideoUploadReservation(
  context: WorkspaceContext,
  input: VideoUploadReservationInput,
  reservation: VideoUploadReservation,
  muxUploadId: string,
) {
  await db.transaction(async (tx) => {
    await tx.insert(assets).values({
      id: reservation.originalAssetId,
      workspaceId: context.workspaceId,
      reviewId: reservation.reviewId,
      kind: "video_original",
      status: "uploading",
      storageProvider: "mux",
      storageKey: muxUploadId,
      originalFileName: input.fileName,
      mimeType: input.mimeType,
      byteSize: input.fileBytes,
      durationMs: Math.round(input.durationSeconds * 1_000),
      uploadedByUserId: context.userId,
    });

    await tx.insert(issueEvidence).values({
      id: reservation.evidenceId,
      workspaceId: context.workspaceId,
      issueId: input.issueId,
      assetId: reservation.originalAssetId,
      kind: "video",
      captureMethod: "manual_attachment",
      captureStatus: "pending",
      createdByUserId: context.userId,
    });

    await tx.insert(videoAssets).values({
      id: reservation.videoAssetId,
      workspaceId: context.workspaceId,
      evidenceId: reservation.evidenceId,
      originalAssetId: reservation.originalAssetId,
      durationMs: Math.round(input.durationSeconds * 1_000),
      processingStatus: "uploading",
      providerUploadId: muxUploadId,
    });
  });
}
