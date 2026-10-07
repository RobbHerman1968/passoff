import "server-only";

import { randomUUID } from "node:crypto";

import { and, eq, inArray, isNull, sql } from "drizzle-orm";

import { db } from "@/db";
import {
  assets,
  issueEvidence,
  issues,
  projects,
  reviews,
  videoAssets,
} from "@/db/schema";
import { checkVideoEvidenceUpload } from "@/lib/billing/video-evidence";
import { canMutateProjects } from "@/lib/projects/permissions";
import { retireVideoRow, type VideoTransaction } from "@/lib/video/lifecycle";
import {
  displayStateFor,
  isAcceptedVideoMimeType,
  isWorkingState,
} from "@/lib/video/states";
import { getWorkspaceVideoUsage, resolveWorkspaceVideoLimits } from "@/lib/video/usage";
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
  projectId: string;
  issueNumber: number;
  /** "add" for the first clip, "replace" when a ready clip stays until this one is ready. */
  mode: "add" | "replace";
};

export type VideoUploadRefusalCode =
  | "permission_denied"
  | "not_found"
  | "closed"
  | "archived"
  | "busy"
  | "invalid_file"
  | "allowance";

export type VideoUploadReservationResult =
  | { ok: true; reservation: VideoUploadReservation }
  | {
      ok: false;
      status: 400 | 403 | 404 | 409;
      code: VideoUploadRefusalCode;
      message: string;
    };

export const VIDEO_BUSY_MESSAGE =
  "A video is already being added to this issue. Let it finish, or cancel it first.";
export const VIDEO_ARCHIVED_MESSAGE =
  "This review is archived, so video evidence can’t be changed. Restore it to make changes.";
export const VIDEO_CLOSED_MESSAGE = "Reopen this issue before adding video evidence.";
export const VIDEO_UNAVAILABLE_MESSAGE = "This issue is no longer available.";
export const VIDEO_NO_PERMISSION_MESSAGE = "You don’t have permission to add video evidence.";

function refuse(
  status: 400 | 403 | 404 | 409,
  code: VideoUploadRefusalCode,
  message: string,
): VideoUploadReservationResult {
  return { ok: false, status, code, message };
}

function isUniqueViolation(error: unknown): boolean {
  let current: unknown = error;
  for (let depth = 0; depth < 4 && current; depth += 1) {
    if (typeof current === "object" && "code" in current) {
      if ((current as { code?: unknown }).code === "23505") return true;
    }
    current =
      typeof current === "object" && current !== null && "cause" in current
        ? (current as { cause?: unknown }).cause
        : null;
  }
  return false;
}

async function lockWorkspaceUploads(tx: VideoTransaction, workspaceId: string) {
  // Serializes allowance checks so two uploads cannot both squeeze under the limit.
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`video:${workspaceId}`}))`);
}

/**
 * Checks everything that can be checked before bytes move, then records the upload
 * in Passoff first. The provider upload is created afterwards, so a record always
 * exists before a browser starts sending a file.
 */
export async function reserveVideoUpload(
  context: WorkspaceContext,
  input: VideoUploadReservationInput,
): Promise<VideoUploadReservationResult> {
  if (!canMutateProjects(context)) {
    return refuse(403, "permission_denied", VIDEO_NO_PERMISSION_MESSAGE);
  }
  if (!isAcceptedVideoMimeType(input.mimeType)) {
    return refuse(
      400,
      "invalid_file",
      "Choose an MP4, MOV, or WebM video and try again.",
    );
  }

  try {
    return await db.transaction(async (tx): Promise<VideoUploadReservationResult> => {
      await lockWorkspaceUploads(tx, context.workspaceId);
      const now = new Date();

      const [issue] = await tx
        .select({
          id: issues.id,
          number: issues.number,
          status: issues.status,
          reviewId: issues.reviewId,
          projectId: issues.projectId,
          reviewArchivedAt: reviews.archivedAt,
          projectStatus: projects.status,
        })
        .from(issues)
        .innerJoin(reviews, eq(reviews.id, issues.reviewId))
        .innerJoin(projects, eq(projects.id, issues.projectId))
        .where(
          and(
            eq(issues.id, input.issueId),
            eq(issues.workspaceId, context.workspaceId),
            eq(reviews.workspaceId, context.workspaceId),
            eq(projects.workspaceId, context.workspaceId),
            isNull(issues.deletedAt),
            isNull(projects.deletedAt),
          ),
        )
        .limit(1)
        .for("update", { of: issues });

      if (!issue) return refuse(404, "not_found", VIDEO_UNAVAILABLE_MESSAGE);
      if (issue.reviewArchivedAt || issue.projectStatus === "archived") {
        return refuse(409, "archived", VIDEO_ARCHIVED_MESSAGE);
      }
      if (issue.status === "closed") {
        return refuse(409, "closed", VIDEO_CLOSED_MESSAGE);
      }

      const existing = await tx
        .select({
          id: videoAssets.id,
          workspaceId: videoAssets.workspaceId,
          evidenceId: videoAssets.evidenceId,
          lifecycle: videoAssets.lifecycle,
          processingStatus: videoAssets.processingStatus,
          createdAt: videoAssets.createdAt,
          providerAssetId: videoAssets.providerAssetId,
          providerUploadId: videoAssets.providerUploadId,
        })
        .from(videoAssets)
        .where(
          and(
            eq(videoAssets.issueId, issue.id),
            eq(videoAssets.workspaceId, context.workspaceId),
            inArray(videoAssets.lifecycle, ["current", "replacement"]),
          ),
        );

      const current = existing.find((row) => row.lifecycle === "current") ?? null;
      const replacement = existing.find((row) => row.lifecycle === "replacement") ?? null;
      const isWorking = (row: (typeof existing)[number]) =>
        isWorkingState(displayStateFor(row, now));

      if ((current && isWorking(current)) || (replacement && isWorking(replacement))) {
        return refuse(409, "busy", VIDEO_BUSY_MESSAGE);
      }

      const currentIsReady = current?.processingStatus === "ready" && !isWorking(current);

      const mode: "add" | "replace" = currentIsReady ? "replace" : "add";

      const { limits } = await resolveWorkspaceVideoLimits(tx, context.workspaceId);
      const usage = await getWorkspaceVideoUsage(tx, context.workspaceId, {
        now,
        // The clip being replaced frees its space once the new one is ready.
        excludeFromRetainedId: mode === "replace" ? (current?.id ?? undefined) : undefined,
      });
      const allowance = checkVideoEvidenceUpload(
        limits ? { status: "approved", limits } : { status: "undecided" },
        {
          durationSeconds: input.durationSeconds,
          fileBytes: input.fileBytes,
          uploadedSecondsThisMonth: usage.newSeconds,
          retainedSeconds: usage.retainedSeconds,
        },
      );
      if (!allowance.allowed) {
        const code: VideoUploadRefusalCode =
          allowance.reason === "monthly_upload_limit" ||
          allowance.reason === "retained_video_limit" ||
          allowance.reason === "undecided_plan"
            ? "allowance"
            : "invalid_file";
        return refuse(400, code, allowance.message);
      }

      // Only now that the upload is allowed: a failed, abandoned, or too-big earlier
      // attempt is replaced by this one.
      for (const stale of [
        replacement,
        current && !currentIsReady ? current : null,
      ]) {
        if (!stale) continue;
        await retireVideoRow(tx, stale, {
          lifecycle: "retired",
          reason: "superseded",
          removedByUserId: context.userId,
          now,
        });
      }

      const reservation: VideoUploadReservation = {
        evidenceId: randomUUID(),
        originalAssetId: randomUUID(),
        videoAssetId: randomUUID(),
        reviewId: issue.reviewId,
        projectId: issue.projectId,
        issueNumber: issue.number,
        mode,
      };
      const durationMs = Math.round(input.durationSeconds * 1_000);

      await tx.insert(assets).values({
        id: reservation.originalAssetId,
        workspaceId: context.workspaceId,
        reviewId: issue.reviewId,
        kind: "video_original",
        status: "pending",
        storageProvider: "mux",
        storageKey: `pending:${reservation.videoAssetId}`,
        originalFileName: input.fileName.slice(0, 255),
        mimeType: input.mimeType.toLowerCase(),
        byteSize: input.fileBytes,
        durationMs,
        uploadedByUserId: context.userId,
      });
      await tx.insert(issueEvidence).values({
        id: reservation.evidenceId,
        workspaceId: context.workspaceId,
        issueId: issue.id,
        assetId: reservation.originalAssetId,
        kind: "video",
        captureMethod: "manual_attachment",
        captureStatus: "pending",
        createdByUserId: context.userId,
      });
      await tx.insert(videoAssets).values({
        id: reservation.videoAssetId,
        workspaceId: context.workspaceId,
        issueId: issue.id,
        evidenceId: reservation.evidenceId,
        originalAssetId: reservation.originalAssetId,
        lifecycle: mode === "replace" ? "replacement" : "current",
        durationMs,
        declaredDurationMs: durationMs,
        declaredBytes: input.fileBytes,
        processingStatus: "pending",
      });

      return { ok: true, reservation };
    });
  } catch (error) {
    if (isUniqueViolation(error)) return refuse(409, "busy", VIDEO_BUSY_MESSAGE);
    throw error;
  }
}

/** Records the provider upload once Mux has created it. Only the upload id is stored. */
export async function attachProviderUpload(
  context: WorkspaceContext,
  reservation: VideoUploadReservation,
  providerUploadId: string,
): Promise<void> {
  await db.transaction(async (tx) => {
    const updated = await tx
      .update(videoAssets)
      .set({
        providerUploadId,
        processingStatus: "uploading",
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(videoAssets.id, reservation.videoAssetId),
          eq(videoAssets.workspaceId, context.workspaceId),
          eq(videoAssets.processingStatus, "pending"),
          inArray(videoAssets.lifecycle, ["current", "replacement"]),
        ),
      )
      .returning({ id: videoAssets.id });
    if (updated.length === 0) {
      throw new Error("The upload record changed before it could be started.");
    }
    await tx
      .update(assets)
      .set({ storageKey: providerUploadId, status: "uploading", updatedAt: new Date() })
      .where(
        and(
          eq(assets.id, reservation.originalAssetId),
          eq(assets.workspaceId, context.workspaceId),
        ),
      );
  });
}

/**
 * Removes a reservation that never reached the provider. Nothing was stored at Mux, so
 * there is nothing to delete there and no record worth keeping.
 */
export async function discardReservation(
  context: WorkspaceContext,
  reservation: VideoUploadReservation,
): Promise<void> {
  await db.transaction(async (tx) => {
    const removed = await tx
      .delete(videoAssets)
      .where(
        and(
          eq(videoAssets.id, reservation.videoAssetId),
          eq(videoAssets.workspaceId, context.workspaceId),
          isNull(videoAssets.providerUploadId),
          isNull(videoAssets.providerAssetId),
        ),
      )
      .returning({ id: videoAssets.id });
    // If the upload already reached the provider, the video record stays, and so must
    // the evidence and original file records it points to.
    if (removed.length === 0) return;
    await tx
      .delete(issueEvidence)
      .where(
        and(
          eq(issueEvidence.id, reservation.evidenceId),
          eq(issueEvidence.workspaceId, context.workspaceId),
        ),
      );
    await tx
      .delete(assets)
      .where(
        and(
          eq(assets.id, reservation.originalAssetId),
          eq(assets.workspaceId, context.workspaceId),
        ),
      );
  });
}
