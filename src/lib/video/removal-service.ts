import "server-only";

import { and, eq, inArray } from "drizzle-orm";

import { db } from "@/db";
import { assets, issues, videoAssets } from "@/db/schema";
import type { IssueScopeInput } from "@/lib/issues/scope";
import { canMutateProjects } from "@/lib/projects/permissions";
import { recordVideoEvent } from "@/lib/video/events";
import { getIssueVideoViewForState, loadVideoIssueState } from "@/lib/video/issue-video";
import { retireVideoRow } from "@/lib/video/lifecycle";
import { deleteProviderCopyNow } from "@/lib/video/provider-deletion";
import { removalReasonFor, type IssueVideoView } from "@/lib/video/states";
import type { WorkspaceContext } from "@/lib/workspaces/context";

export const VIDEO_REMOVE_UNAVAILABLE_MESSAGE = "This video isn’t available.";
export const VIDEO_REMOVE_ARCHIVED_MESSAGE =
  "This review is archived, so video evidence can’t be changed. Restore it to make changes.";
export const VIDEO_REMOVE_FAILED_MESSAGE =
  "We couldn’t remove this video. Check your connection and try again.";

export type RemoveVideoResult =
  | { ok: true; view: IssueVideoView }
  | { ok: false; message: string };

/**
 * Removes the clip people see, or cancels an upload that is still on its way. The issue,
 * its discussion, and its history stay. The stored copy is deleted at the provider right
 * away when possible, and retried until it is gone.
 */
export async function removeIssueVideo(
  context: WorkspaceContext,
  input: IssueScopeInput & { videoAssetId: string },
): Promise<RemoveVideoResult> {
  if (!canMutateProjects(context)) {
    return { ok: false, message: VIDEO_REMOVE_UNAVAILABLE_MESSAGE };
  }

  try {
    const outcome = await db.transaction(
      async (
        tx,
      ): Promise<
        | {
            kind: "ok";
            issueId: string;
            wasReady: boolean;
            uploaderUserId: string | null;
            durationMs: number | null;
          }
        | { kind: "missing" }
        | { kind: "archived" }
      > => {
        const state = await loadVideoIssueState(tx, context.workspaceId, input);
        if (!state) return { kind: "missing" };
        if (state.archived) return { kind: "archived" };

        await tx
          .select({ id: issues.id })
          .from(issues)
          .where(and(eq(issues.id, state.issueId), eq(issues.workspaceId, context.workspaceId)))
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
              eq(videoAssets.id, input.videoAssetId),
              eq(videoAssets.workspaceId, context.workspaceId),
              eq(videoAssets.issueId, state.issueId),
              inArray(videoAssets.lifecycle, ["current", "replacement"]),
            ),
          )
          .limit(1);
        if (!row) return { kind: "missing" };

        const retired = await retireVideoRow(tx, row, {
          lifecycle: "removed",
          reason: removalReasonFor(row.lifecycle, row.processingStatus),
          removedByUserId: context.userId,
        });
        if (!retired) return { kind: "missing" };

        // Keep the unfinished clip out of the month's usage once it is cancelled.
        if (row.processingStatus === "pending" || row.processingStatus === "uploading") {
          await tx
            .update(videoAssets)
            .set({
              processingStatus: "failed",
              failureReason: "upload_failed",
            })
            .where(eq(videoAssets.id, row.id));
        }

        return {
          kind: "ok",
          issueId: state.issueId,
          wasReady: row.processingStatus === "ready",
          uploaderUserId: row.uploadedByUserId,
          durationMs: row.durationMs,
        };
      },
    );

    if (outcome.kind === "missing") {
      return { ok: false, message: VIDEO_REMOVE_UNAVAILABLE_MESSAGE };
    }
    if (outcome.kind === "archived") {
      return { ok: false, message: VIDEO_REMOVE_ARCHIVED_MESSAGE };
    }

    if (outcome.wasReady) {
      await recordVideoEvent({
        kind: "removed",
        videoAssetId: input.videoAssetId,
        workspaceId: context.workspaceId,
        issueId: outcome.issueId,
        actorUserId: context.userId,
        uploaderUserId: outcome.uploaderUserId,
        durationSeconds: outcome.durationMs == null ? null : outcome.durationMs / 1_000,
      });
    }

    // Try the provider now. If it fails, the scheduled run keeps trying.
    await deleteProviderCopyNow(input.videoAssetId).catch(() => undefined);

    const state = await loadVideoIssueState(db, context.workspaceId, input);
    if (!state) return { ok: false, message: VIDEO_REMOVE_UNAVAILABLE_MESSAGE };
    return { ok: true, view: await getIssueVideoViewForState(context, state) };
  } catch {
    return { ok: false, message: VIDEO_REMOVE_FAILED_MESSAGE };
  }
}

/** Queues deletion for every clip in a project that was just deleted. */
export async function requestVideoDeletionForProject(
  workspaceId: string,
  projectId: string,
): Promise<number> {
  const rows = await db
    .select({
      id: videoAssets.id,
      workspaceId: videoAssets.workspaceId,
      evidenceId: videoAssets.evidenceId,
      providerAssetId: videoAssets.providerAssetId,
      providerUploadId: videoAssets.providerUploadId,
    })
    .from(videoAssets)
    .innerJoin(issues, eq(issues.id, videoAssets.issueId))
    .where(
      and(
        eq(videoAssets.workspaceId, workspaceId),
        eq(issues.projectId, projectId),
        inArray(videoAssets.lifecycle, ["current", "replacement"]),
      ),
    );

  let removed = 0;
  for (const row of rows) {
    const done = await db.transaction((tx) =>
      retireVideoRow(tx, row, { lifecycle: "removed", reason: "project_deleted" }),
    );
    if (done) {
      removed += 1;
      await deleteProviderCopyNow(row.id).catch(() => undefined);
    }
  }
  return removed;
}
