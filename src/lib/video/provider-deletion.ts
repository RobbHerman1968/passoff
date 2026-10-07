import "server-only";

import { and, eq, inArray, isNotNull, isNull, lt, lte, or, sql } from "drizzle-orm";

import { db } from "@/db";
import { videoAssets } from "@/db/schema";
import { retireVideoRow } from "@/lib/video/lifecycle";
import { cancelMuxUpload, deleteMuxAsset, type MuxDeleteOutcome } from "@/lib/video/mux";
import { nextProviderDeleteBackoffMs } from "@/lib/video/provider-backoff";
import { VIDEO_UPLOAD_STALE_MS } from "@/lib/video/states";

/** A claimed deletion is not retried by another worker for this long. */
const CLAIM_WINDOW_MS = 5 * 60 * 1000;

export type ProviderDeletionSummary = {
  attempted: number;
  deleted: number;
  deferred: number;
};

type ClaimedRow = {
  id: string;
  workspaceId: string;
  providerAssetId: string | null;
  providerUploadId: string | null;
  attempts: number;
};

async function claimNextRows(
  now: Date,
  limit: number,
  onlyVideoAssetId?: string,
): Promise<ClaimedRow[]> {
  const candidates = await db
    .select({ id: videoAssets.id })
    .from(videoAssets)
    .where(
      and(
        isNotNull(videoAssets.providerDeleteRequestedAt),
        isNull(videoAssets.providerDeletedAt),
        or(
          isNull(videoAssets.providerDeleteNextAttemptAt),
          lte(videoAssets.providerDeleteNextAttemptAt, now),
        ),
        onlyVideoAssetId ? eq(videoAssets.id, onlyVideoAssetId) : undefined,
      ),
    )
    .orderBy(videoAssets.providerDeleteRequestedAt)
    .limit(limit);

  const claimed: ClaimedRow[] = [];
  for (const candidate of candidates) {
    const rows = await db
      .update(videoAssets)
      .set({
        providerDeleteNextAttemptAt: new Date(now.getTime() + CLAIM_WINDOW_MS),
        providerDeleteAttempts: sql`${videoAssets.providerDeleteAttempts} + 1`,
      })
      .where(
        and(
          eq(videoAssets.id, candidate.id),
          isNotNull(videoAssets.providerDeleteRequestedAt),
          isNull(videoAssets.providerDeletedAt),
          or(
            isNull(videoAssets.providerDeleteNextAttemptAt),
            lte(videoAssets.providerDeleteNextAttemptAt, now),
          ),
        ),
      )
      .returning({
        id: videoAssets.id,
        workspaceId: videoAssets.workspaceId,
        providerAssetId: videoAssets.providerAssetId,
        providerUploadId: videoAssets.providerUploadId,
        attempts: videoAssets.providerDeleteAttempts,
      });
    if (rows[0]) claimed.push(rows[0]);
  }
  return claimed;
}

async function runProviderDelete(row: ClaimedRow): Promise<MuxDeleteOutcome> {
  if (row.providerAssetId) return deleteMuxAsset(row.providerAssetId);
  if (row.providerUploadId) return cancelMuxUpload(row.providerUploadId);
  return { done: true };
}

async function settle(row: ClaimedRow, outcome: MuxDeleteOutcome, now: Date) {
  if (outcome.done) {
    await db
      .update(videoAssets)
      .set({
        providerDeletedAt: now,
        providerDeleteLastError: null,
        providerDeleteNextAttemptAt: null,
        updatedAt: now,
      })
      .where(and(eq(videoAssets.id, row.id), eq(videoAssets.workspaceId, row.workspaceId)));
    return;
  }
  await db
    .update(videoAssets)
    .set({
      providerDeleteLastError: outcome.code,
      providerDeleteNextAttemptAt: new Date(
        now.getTime() + nextProviderDeleteBackoffMs(row.attempts),
      ),
      updatedAt: now,
    })
    .where(and(eq(videoAssets.id, row.id), eq(videoAssets.workspaceId, row.workspaceId)));
}

/**
 * Deletes stored video at the provider for every clip that was removed or replaced.
 * A failure schedules a later try; nothing here changes what people see.
 */
export async function processPendingProviderDeletions(
  options: { limit?: number; now?: Date } = {},
): Promise<ProviderDeletionSummary> {
  const now = options.now ?? new Date();
  const rows = await claimNextRows(now, options.limit ?? 20);
  const summary: ProviderDeletionSummary = { attempted: rows.length, deleted: 0, deferred: 0 };

  for (const row of rows) {
    let outcome: MuxDeleteOutcome;
    try {
      outcome = await runProviderDelete(row);
    } catch {
      outcome = { done: false, code: "provider_error" };
    }
    await settle(row, outcome, now);
    if (outcome.done) summary.deleted += 1;
    else summary.deferred += 1;
  }
  return summary;
}

/** Asks for deletion of one clip right away, without waiting for the scheduled run. */
export async function deleteProviderCopyNow(videoAssetId: string): Promise<void> {
  const now = new Date();
  const [row] = await claimNextRows(now, 1, videoAssetId);
  if (!row) return;
  let outcome: MuxDeleteOutcome;
  try {
    outcome = await runProviderDelete(row);
  } catch {
    outcome = { done: false, code: "provider_error" };
  }
  await settle(row, outcome, now);
}

/** Retires uploads that never finished so they stop holding space and cost. */
export async function sweepStaleVideoUploads(
  options: { now?: Date; limit?: number } = {},
): Promise<{ retired: number }> {
  const now = options.now ?? new Date();
  const staleBefore = new Date(now.getTime() - VIDEO_UPLOAD_STALE_MS);
  const stale = await db
    .select({
      id: videoAssets.id,
      workspaceId: videoAssets.workspaceId,
      evidenceId: videoAssets.evidenceId,
      providerAssetId: videoAssets.providerAssetId,
      providerUploadId: videoAssets.providerUploadId,
    })
    .from(videoAssets)
    .where(
      and(
        inArray(videoAssets.lifecycle, ["current", "replacement"]),
        inArray(videoAssets.processingStatus, ["pending", "uploading"]),
        lt(videoAssets.createdAt, staleBefore),
      ),
    )
    .limit(options.limit ?? 50);

  let retired = 0;
  for (const row of stale) {
    const changed = await db.transaction(async (tx) => {
      const done = await retireVideoRow(tx, row, {
        lifecycle: "retired",
        reason: "upload_abandoned",
        now,
      });
      if (done) {
        await tx
          .update(videoAssets)
          .set({ processingStatus: "failed", failureReason: "upload_failed" })
          .where(eq(videoAssets.id, row.id));
      }
      return done;
    });
    if (changed) retired += 1;
  }
  return { retired };
}
