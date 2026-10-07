import "server-only";

import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import {
  assets,
  issueEvidence,
  issues,
  providerEvents,
  videoAssets,
} from "@/db/schema";
import { VIDEO_FAILURE_REASONS, type VideoFailureReason } from "@/lib/video/failure-reasons";
import { recordVideoEvent } from "@/lib/video/events";
import {
  requestProviderDeletion,
  retireVideoRow,
  type VideoTransaction,
} from "@/lib/video/lifecycle";
import { retentionEndForIssue } from "@/lib/video/retention";
import {
  checkMeasuredClip,
  maxHeightFromTracks,
  measuredClipFitsAllowance,
  measuredLengthNeedsAllowanceCheck,
} from "@/lib/video/validation";
import { getWorkspaceVideoUsage, resolveWorkspaceVideoLimits } from "@/lib/video/usage";

export const MUX_PROVIDER = "mux";

type MuxWebhookEvent = {
  id: string;
  type: string;
  created_at: string;
  data: unknown;
};

const TERMINAL_STATUSES = new Set<string>(["ready", "needs_attention", "failed"]);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type VideoRecord = {
  id: string;
  workspaceId: string;
  issueId: string | null;
  evidenceId: string | null;
  originalAssetId: string;
  lifecycle: string;
  processingStatus: string;
  failureReason: string | null;
  declaredDurationMs: number | null;
  providerUploadId: string | null;
  providerAssetId: string | null;
  providerPlaybackId: string | null;
  uploadedByUserId: string | null;
};

const VIDEO_COLUMNS = {
  id: videoAssets.id,
  workspaceId: videoAssets.workspaceId,
  issueId: videoAssets.issueId,
  evidenceId: videoAssets.evidenceId,
  originalAssetId: videoAssets.originalAssetId,
  lifecycle: videoAssets.lifecycle,
  processingStatus: videoAssets.processingStatus,
  failureReason: videoAssets.failureReason,
  declaredDurationMs: videoAssets.declaredDurationMs,
  providerUploadId: videoAssets.providerUploadId,
  providerAssetId: videoAssets.providerAssetId,
  providerPlaybackId: videoAssets.providerPlaybackId,
  uploadedByUserId: assets.uploadedByUserId,
};

/** What to tell people once the database work has committed. */
type AfterEffects = {
  event?: Parameters<typeof recordVideoEvent>[0];
  deleteVideoAssetId?: string;
};

function parseEventCreatedAt(value: string | undefined): Date | null {
  if (!value) return null;
  const asNumber = Number(value);
  if (Number.isFinite(asNumber)) {
    // Mux may send unix seconds as a string.
    return new Date(asNumber > 1e12 ? asNumber : asNumber * 1000);
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function signedPlaybackId(
  playbackIds: Array<{ id: string; policy: string }> | undefined,
): string | null {
  const signed = playbackIds?.find((item) => item.policy === "signed");
  return signed?.id ?? null;
}

async function findVideo(lookup: {
  passthrough?: string | null;
  providerAssetId?: string | null;
  providerUploadId?: string | null;
}): Promise<VideoRecord | null> {
  const attempts: Array<ReturnType<typeof eq>> = [];
  if (lookup.passthrough && UUID_PATTERN.test(lookup.passthrough)) {
    attempts.push(eq(videoAssets.id, lookup.passthrough));
  }
  if (lookup.providerAssetId) attempts.push(eq(videoAssets.providerAssetId, lookup.providerAssetId));
  if (lookup.providerUploadId) {
    attempts.push(eq(videoAssets.providerUploadId, lookup.providerUploadId));
  }
  for (const condition of attempts) {
    const [row] = await db
      .select(VIDEO_COLUMNS)
      .from(videoAssets)
      .leftJoin(assets, eq(assets.id, videoAssets.originalAssetId))
      .where(condition)
      .limit(1);
    if (row) return row;
  }
  return null;
}

function identifiersMatch(
  video: VideoRecord,
  input: { providerUploadId?: string | null; providerAssetId?: string | null },
): boolean {
  if (
    input.providerUploadId &&
    video.providerUploadId &&
    video.providerUploadId !== input.providerUploadId
  ) {
    return false;
  }
  if (
    input.providerAssetId &&
    video.providerAssetId &&
    video.providerAssetId !== input.providerAssetId
  ) {
    return false;
  }
  return true;
}

function isInUse(video: { lifecycle: string }) {
  return video.lifecycle === "current" || video.lifecycle === "replacement";
}

async function lockIssue(tx: VideoTransaction, workspaceId: string, issueId: string | null) {
  if (!issueId) return;
  await tx
    .select({ id: issues.id })
    .from(issues)
    .where(and(eq(issues.id, issueId), eq(issues.workspaceId, workspaceId)))
    .for("update");
}

async function reloadVideo(tx: VideoTransaction, videoAssetId: string) {
  const [row] = await tx
    .select(VIDEO_COLUMNS)
    .from(videoAssets)
    .leftJoin(assets, eq(assets.id, videoAssets.originalAssetId))
    .where(eq(videoAssets.id, videoAssetId))
    .limit(1)
    .for("update", { of: videoAssets });
  return row ?? null;
}

async function setStatuses(
  tx: VideoTransaction,
  video: Pick<VideoRecord, "id" | "workspaceId" | "originalAssetId" | "evidenceId">,
  values: {
    status: "processing" | "ready" | "needs_attention" | "failed";
    evidence: "pending" | "ready" | "unavailable" | "failed";
    failureReason: string | null;
    durationMs?: number;
  },
  now: Date,
) {
  await tx
    .update(assets)
    .set({
      status: values.status,
      failureReason: values.failureReason,
      ...(values.durationMs != null ? { durationMs: values.durationMs } : {}),
      updatedAt: now,
    })
    .where(and(eq(assets.id, video.originalAssetId), eq(assets.workspaceId, video.workspaceId)));

  if (video.evidenceId) {
    await tx
      .update(issueEvidence)
      .set({
        captureStatus: values.evidence,
        ...(values.evidence === "ready" ? { capturedAt: now } : {}),
      })
      .where(
        and(
          eq(issueEvidence.id, video.evidenceId),
          eq(issueEvidence.workspaceId, video.workspaceId),
        ),
      );
  }
}

async function claimProviderEvent(
  ctx: { claimedHere: boolean; providerEventId: string },
  input: {
    eventType: string;
    eventCreatedAt: Date | null;
    workspaceId?: string | null;
    videoAssetId?: string | null;
  },
): Promise<"claimed" | "duplicate"> {
  const inserted = await db
    .insert(providerEvents)
    .values({
      provider: MUX_PROVIDER,
      providerEventId: ctx.providerEventId,
      eventType: input.eventType,
      eventCreatedAt: input.eventCreatedAt,
      workspaceId: input.workspaceId ?? null,
      videoAssetId: input.videoAssetId ?? null,
    })
    .onConflictDoNothing({
      target: [providerEvents.provider, providerEvents.providerEventId],
    })
    .returning({ id: providerEvents.id });

  if (inserted.length > 0) {
    ctx.claimedHere = true;
    return "claimed";
  }
  return "duplicate";
}

export type MuxWebhookProcessResult =
  | {
      ok: true;
      status: "processed" | "ignored" | "duplicate";
      /** A stored copy that should be deleted at the provider as soon as possible. */
      deleteVideoAssetId?: string;
    }
  | { ok: false; status: "error" };

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** Records that the stored copy exists and must be deleted, without changing what people see. */
async function bindAndDeleteOrphan(
  video: VideoRecord,
  ids: { providerAssetId?: string | null; providerUploadId?: string | null },
): Promise<AfterEffects> {
  await db.transaction(async (tx) => {
    const now = new Date();
    await tx
      .update(videoAssets)
      .set({
        providerAssetId: video.providerAssetId ?? ids.providerAssetId ?? null,
        providerUploadId: video.providerUploadId ?? ids.providerUploadId ?? null,
        updatedAt: now,
      })
      .where(and(eq(videoAssets.id, video.id), eq(videoAssets.workspaceId, video.workspaceId)));
    await requestProviderDeletion(tx, video, now);
  });
  return { deleteVideoAssetId: video.id };
}

async function markProcessing(
  video: VideoRecord,
  input: { providerUploadId?: string | null; providerAssetId?: string | null },
): Promise<AfterEffects> {
  if (!isInUse(video)) return bindAndDeleteOrphan(video, input);

  if (TERMINAL_STATUSES.has(video.processingStatus)) {
    // Late event: keep the provider ids, never step the state backwards.
    if (
      (input.providerAssetId && !video.providerAssetId) ||
      (input.providerUploadId && !video.providerUploadId)
    ) {
      await db
        .update(videoAssets)
        .set({
          providerAssetId: video.providerAssetId ?? input.providerAssetId ?? null,
          providerUploadId: video.providerUploadId ?? input.providerUploadId ?? null,
          updatedAt: new Date(),
        })
        .where(and(eq(videoAssets.id, video.id), eq(videoAssets.workspaceId, video.workspaceId)));
    }
    return {};
  }

  const now = new Date();
  await db.transaction(async (tx) => {
    await tx
      .update(videoAssets)
      .set({
        processingStatus: "processing",
        failureReason: null,
        providerUploadId: video.providerUploadId ?? input.providerUploadId ?? null,
        providerAssetId: video.providerAssetId ?? input.providerAssetId ?? null,
        updatedAt: now,
      })
      .where(and(eq(videoAssets.id, video.id), eq(videoAssets.workspaceId, video.workspaceId)));
    await setStatuses(
      tx,
      video,
      { status: "processing", evidence: "pending", failureReason: null },
      now,
    );
  });
  return {};
}

/** The upload or processing failed. The old clip, if any, stays in place. */
async function markFailure(
  video: VideoRecord,
  reason: VideoFailureReason,
  options: { providerAssetId?: string | null; notify?: boolean } = {},
): Promise<AfterEffects> {
  if (!isInUse(video)) {
    return options.providerAssetId
      ? bindAndDeleteOrphan(video, { providerAssetId: options.providerAssetId })
      : {};
  }
  const now = new Date();
  await db.transaction(async (tx) => {
    await tx
      .update(videoAssets)
      .set({
        processingStatus: "failed",
        failureReason: reason,
        providerPlaybackId: null,
        providerAssetId: video.providerAssetId ?? options.providerAssetId ?? null,
        updatedAt: now,
      })
      .where(and(eq(videoAssets.id, video.id), eq(videoAssets.workspaceId, video.workspaceId)));
    await setStatuses(tx, video, { status: "failed", evidence: "failed", failureReason: reason }, now);
  });

  if (options.notify === false || !video.issueId) return {};
  return {
    event: {
      kind: "needs_attention",
      videoAssetId: video.id,
      workspaceId: video.workspaceId,
      issueId: video.issueId,
      actorUserId: video.uploadedByUserId,
      uploaderUserId: video.uploadedByUserId,
      failureReason: reason,
    },
  };
}

type ReadyInput = {
  providerAssetId: string;
  providerUploadId: string | null;
  providerPlaybackId: string;
  durationSeconds: number;
  maxHeight: number | null;
};

/**
 * The clip is measured and ready at Mux. Mux's duration and size decide whether it may be
 * used. A good clip becomes the issue's video; a replacement takes over from the old one
 * only now, in the same step.
 */
async function applyReady(video: VideoRecord, input: ReadyInput): Promise<AfterEffects> {
  const durationMs = Math.round(input.durationSeconds * 1_000);
  const now = new Date();

  return db.transaction(async (tx): Promise<AfterEffects> => {
    await lockIssue(tx, video.workspaceId, video.issueId);
    const row = await reloadVideo(tx, video.id);
    if (!row) return {};

    if (!isInUse(row)) {
      await tx
        .update(videoAssets)
        .set({ providerAssetId: row.providerAssetId ?? input.providerAssetId })
        .where(eq(videoAssets.id, row.id));
      await requestProviderDeletion(tx, row, now);
      return { deleteVideoAssetId: row.id };
    }
    if (row.processingStatus === "ready") return {};
    if (
      row.processingStatus === "failed" &&
      row.failureReason === VIDEO_FAILURE_REASONS.provider_deleted
    ) {
      // The stored copy was deleted; a late ready event must not bring it back.
      return {};
    }

    const measured = checkMeasuredClip({
      durationSeconds: input.durationSeconds,
      maxHeight: input.maxHeight,
    });
    let failure: VideoFailureReason | null = measured.ok ? null : measured.reason;

    if (!failure && measuredLengthNeedsAllowanceCheck(row.declaredDurationMs, durationMs)) {
      const { limits } = await resolveWorkspaceVideoLimits(tx, row.workspaceId);
      let replacedId: string | undefined;
      if (row.lifecycle === "replacement" && row.issueId) {
        const [currentRow] = await tx
          .select({ id: videoAssets.id })
          .from(videoAssets)
          .where(and(eq(videoAssets.issueId, row.issueId), eq(videoAssets.lifecycle, "current")))
          .limit(1);
        replacedId = currentRow?.id;
      }
      const others = await getWorkspaceVideoUsage(tx, row.workspaceId, {
        excludeVideoAssetId: row.id,
        excludeFromRetainedId: replacedId,
      });
      const fits = measuredClipFitsAllowance({
        limits,
        measuredDurationSeconds: input.durationSeconds,
        otherNewSecondsThisMonth: others.newSeconds,
        otherRetainedSeconds: others.retainedSeconds,
      });
      if (!fits.ok) failure = fits.reason;
    }

    if (failure) {
      // Too long, too large, or over the plan: never playable. Stop paying to store it.
      await tx
        .update(videoAssets)
        .set({
          processingStatus: "needs_attention",
          failureReason: failure,
          durationMs,
          maxHeight: input.maxHeight,
          metadataVerifiedAt: now,
          providerAssetId: row.providerAssetId ?? input.providerAssetId,
          providerUploadId: row.providerUploadId ?? input.providerUploadId,
          providerPlaybackId: null,
          updatedAt: now,
        })
        .where(eq(videoAssets.id, row.id));
      await requestProviderDeletion(tx, row, now);
      await setStatuses(
        tx,
        row,
        { status: "needs_attention", evidence: "unavailable", failureReason: failure, durationMs },
        now,
      );
      return {
        deleteVideoAssetId: row.id,
        event: row.issueId
          ? {
              kind: "needs_attention",
              videoAssetId: row.id,
              workspaceId: row.workspaceId,
              issueId: row.issueId,
              actorUserId: row.uploadedByUserId,
              uploaderUserId: row.uploadedByUserId,
              failureReason: failure,
              durationSeconds: input.durationSeconds,
            }
          : undefined,
      };
    }

    let replacedPrevious = false;
    let previousId: string | undefined;
    if (row.lifecycle === "replacement" && row.issueId) {
      const [previous] = await tx
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
            eq(videoAssets.issueId, row.issueId),
            eq(videoAssets.workspaceId, row.workspaceId),
            eq(videoAssets.lifecycle, "current"),
          ),
        )
        .limit(1)
        .for("update");
      if (previous) {
        await retireVideoRow(tx, previous, {
          lifecycle: "retired",
          reason: "replaced",
          removedByUserId: row.uploadedByUserId,
          now,
        });
        replacedPrevious = true;
        previousId = previous.id;
      }
    }

    // A clip that becomes ready on an issue that closed in the meantime is on the same clock.
    const retentionEndsAt = row.issueId
      ? await retentionEndForIssue(tx, row.workspaceId, row.issueId)
      : null;
    await tx
      .update(videoAssets)
      .set({
        lifecycle: "current",
        retentionEndsAt,
        processingStatus: "ready",
        failureReason: null,
        durationMs,
        maxHeight: input.maxHeight,
        metadataVerifiedAt: now,
        providerAssetId: input.providerAssetId,
        providerPlaybackId: input.providerPlaybackId,
        providerUploadId: row.providerUploadId ?? input.providerUploadId,
        updatedAt: now,
      })
      .where(eq(videoAssets.id, row.id));
    await setStatuses(
      tx,
      row,
      { status: "ready", evidence: "ready", failureReason: null, durationMs },
      now,
    );

    return {
      deleteVideoAssetId: previousId,
      event: row.issueId
        ? {
            kind: replacedPrevious ? "replaced" : "ready",
            videoAssetId: row.id,
            workspaceId: row.workspaceId,
            issueId: row.issueId,
            actorUserId: row.uploadedByUserId,
            uploaderUserId: row.uploadedByUserId,
            durationSeconds: input.durationSeconds,
            replacedPrevious,
          }
        : undefined,
    };
  });
}

async function releaseClaim(providerEventId: string) {
  await db
    .delete(providerEvents)
    .where(
      and(
        eq(providerEvents.provider, MUX_PROVIDER),
        eq(providerEvents.providerEventId, providerEventId),
      ),
    );
}

async function finish(effects: AfterEffects): Promise<MuxWebhookProcessResult> {
  if (effects.event) await recordVideoEvent(effects.event);
  return {
    ok: true,
    status: "processed",
    ...(effects.deleteVideoAssetId ? { deleteVideoAssetId: effects.deleteVideoAssetId } : {}),
  };
}

/**
 * Handles one verified Mux event. Safe to repeat and safe out of order: each event id is
 * recorded once, a finished clip never moves backwards, and an event for a clip that was
 * removed or replaced only ever leads to deleting the stored copy.
 *
 * If handling fails, the receipt is released so Mux's retry is processed again.
 */
export async function processMuxWebhookEvent(
  event: MuxWebhookEvent,
): Promise<MuxWebhookProcessResult> {
  const ctx = { claimedHere: false, providerEventId: event.id };
  try {
    return await dispatchMuxEvent(event, ctx);
  } catch (error) {
    if (ctx.claimedHere) await releaseClaim(event.id).catch(() => undefined);
    throw error;
  }
}

async function dispatchMuxEvent(
  event: MuxWebhookEvent,
  ctx: { claimedHere: boolean; providerEventId: string },
): Promise<MuxWebhookProcessResult> {
  const eventCreatedAt = parseEventCreatedAt(event.created_at);
  const data = asRecord(event.data);

  const claim = (video?: VideoRecord | null) =>
    claimProviderEvent(ctx, {
      eventType: event.type,
      eventCreatedAt,
      workspaceId: video?.workspaceId,
      videoAssetId: video?.id,
    });
  const ignore = async (video?: VideoRecord | null): Promise<MuxWebhookProcessResult> => {
    await claim(video);
    return { ok: true, status: "ignored" };
  };

  switch (event.type) {
    case "video.upload.asset_created": {
      const uploadId = asString(data.id);
      const providerAssetId = asString(data.asset_id);
      const passthrough = asString(asRecord(data.new_asset_settings).passthrough);
      if (!uploadId) return ignore();

      const video = await findVideo({ passthrough, providerUploadId: uploadId });
      if (!video) return ignore();
      if (!identifiersMatch(video, { providerUploadId: uploadId, providerAssetId })) {
        return ignore(video);
      }
      if ((await claim(video)) === "duplicate") return { ok: true, status: "duplicate" };

      return finish(await markProcessing(video, { providerUploadId: uploadId, providerAssetId }));
    }

    case "video.upload.cancelled":
    case "video.upload.errored": {
      const uploadId = asString(data.id);
      const passthrough = asString(asRecord(data.new_asset_settings).passthrough);
      if (!uploadId) return ignore();

      const video = await findVideo({ passthrough, providerUploadId: uploadId });
      if (!video) return ignore();
      if (!identifiersMatch(video, { providerUploadId: uploadId })) return ignore(video);
      if ((await claim(video)) === "duplicate") return { ok: true, status: "duplicate" };

      if (!isInUse(video)) {
        // Cancelling a removed clip's upload is exactly what we wanted.
        await db
          .update(videoAssets)
          .set({ providerDeletedAt: new Date(), providerDeleteLastError: null })
          .where(
            and(eq(videoAssets.id, video.id), eq(videoAssets.workspaceId, video.workspaceId)),
          );
        return { ok: true, status: "processed" };
      }
      if (video.processingStatus === "ready" || video.providerAssetId) {
        return { ok: true, status: "ignored" };
      }
      return finish(await markFailure(video, VIDEO_FAILURE_REASONS.upload_failed));
    }

    case "video.asset.ready": {
      const providerAssetId = asString(data.id);
      const passthrough = asString(data.passthrough);
      const playbackId = signedPlaybackId(
        data.playback_ids as Array<{ id: string; policy: string }> | undefined,
      );
      const durationSeconds = asNumber(data.duration);
      const uploadId = asString(data.upload_id);
      if (!providerAssetId) return ignore();

      const video = await findVideo({ passthrough, providerAssetId });
      if (!video || durationSeconds == null || !playbackId) return ignore(video);
      if (!identifiersMatch(video, { providerAssetId, providerUploadId: uploadId })) {
        return ignore(video);
      }
      if ((await claim(video)) === "duplicate") return { ok: true, status: "duplicate" };

      return finish(
        await applyReady(video, {
          providerAssetId,
          providerUploadId: uploadId,
          providerPlaybackId: playbackId,
          durationSeconds,
          maxHeight: maxHeightFromTracks(data.tracks),
        }),
      );
    }

    case "video.asset.errored": {
      const providerAssetId = asString(data.id);
      const passthrough = asString(data.passthrough);
      const uploadId = asString(data.upload_id);
      if (!providerAssetId) return ignore();

      const video = await findVideo({ passthrough, providerAssetId });
      if (!video) return ignore();
      if (!identifiersMatch(video, { providerAssetId, providerUploadId: uploadId })) {
        return ignore(video);
      }
      if ((await claim(video)) === "duplicate") return { ok: true, status: "duplicate" };

      // A late error must not damage a clip that is already ready.
      if (video.processingStatus === "ready") return { ok: true, status: "ignored" };

      return finish(
        await markFailure(video, VIDEO_FAILURE_REASONS.processing_failed, { providerAssetId }),
      );
    }

    case "video.asset.deleted": {
      const providerAssetId = asString(data.id);
      const passthrough = asString(data.passthrough);
      const video = providerAssetId ? await findVideo({ passthrough, providerAssetId }) : null;

      if ((await claim(video)) === "duplicate") return { ok: true, status: "duplicate" };
      if (!video || !providerAssetId) return { ok: true, status: "ignored" };
      if (!identifiersMatch(video, { providerAssetId })) return { ok: true, status: "ignored" };

      if (!isInUse(video) || video.processingStatus === "needs_attention") {
        // We asked for this deletion. Record that the stored copy is gone.
        await db
          .update(videoAssets)
          .set({
            providerDeletedAt: new Date(),
            providerDeleteLastError: null,
            providerPlaybackId: null,
          })
          .where(
            and(eq(videoAssets.id, video.id), eq(videoAssets.workspaceId, video.workspaceId)),
          );
        return { ok: true, status: "processed" };
      }

      // Deleted at Mux without Passoff asking (for example in Mux's own dashboard).
      return finish(
        await markFailure(video, VIDEO_FAILURE_REASONS.provider_deleted, { notify: false }),
      );
    }

    default: {
      await claim();
      return { ok: true, status: "ignored" };
    }
  }
}
