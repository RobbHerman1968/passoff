import "server-only";

import { and, eq, inArray, isNull, sql } from "drizzle-orm";

import type { db } from "@/db";
import { issueEvidence, videoAssets } from "@/db/schema";
import type { VideoRemovalReason } from "@/lib/video/states";

export type VideoTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type RemovableVideoRow = {
  id: string;
  workspaceId: string;
  evidenceId: string | null;
  providerAssetId: string | null;
  providerUploadId: string | null;
};

/**
 * Takes a clip out of use right away: no playback, no longer counted as kept video,
 * and queued for deletion at the provider. The row stays as the record of what happened.
 * Safe to repeat; a clip that is already retired or removed is left alone.
 */
export async function retireVideoRow(
  tx: VideoTransaction,
  row: RemovableVideoRow,
  input: {
    lifecycle: "retired" | "removed";
    reason: VideoRemovalReason;
    removedByUserId?: string | null;
    now?: Date;
  },
): Promise<boolean> {
  const now = input.now ?? new Date();
  const hasProviderCopy = Boolean(row.providerAssetId || row.providerUploadId);

  const updated = await tx
    .update(videoAssets)
    .set({
      lifecycle: input.lifecycle,
      removedAt: now,
      removedByUserId: input.removedByUserId ?? null,
      removalReason: input.reason,
      providerPlaybackId: null,
      // Keep an earlier request or completed deletion; never restart one.
      providerDeleteRequestedAt: sql`coalesce(${videoAssets.providerDeleteRequestedAt}, ${
        hasProviderCopy ? now : null
      }::timestamptz)`,
      providerDeletedAt: sql`coalesce(${videoAssets.providerDeletedAt}, ${
        hasProviderCopy ? null : now
      }::timestamptz)`,
      providerDeleteNextAttemptAt: null,
      updatedAt: now,
    })
    .where(
      and(
        eq(videoAssets.id, row.id),
        eq(videoAssets.workspaceId, row.workspaceId),
        inArray(videoAssets.lifecycle, ["current", "replacement"]),
      ),
    )
    .returning({ id: videoAssets.id });

  if (updated.length === 0) return false;

  if (row.evidenceId) {
    await tx
      .update(issueEvidence)
      .set({ captureStatus: "unavailable" })
      .where(
        and(
          eq(issueEvidence.id, row.evidenceId),
          eq(issueEvidence.workspaceId, row.workspaceId),
        ),
      );
  }
  return true;
}

/** Marks a provider copy for deletion without changing what people see. */
export async function requestProviderDeletion(
  tx: Pick<VideoTransaction, "update">,
  row: { id: string; workspaceId: string },
  now: Date = new Date(),
) {
  await tx
    .update(videoAssets)
    .set({
      providerDeleteRequestedAt: sql`coalesce(${videoAssets.providerDeleteRequestedAt}, ${now}::timestamptz)`,
      providerDeleteNextAttemptAt: null,
      providerPlaybackId: null,
      updatedAt: now,
    })
    .where(
      and(
        eq(videoAssets.id, row.id),
        eq(videoAssets.workspaceId, row.workspaceId),
        isNull(videoAssets.providerDeletedAt),
      ),
    );
}
