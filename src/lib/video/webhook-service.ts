import "server-only";

import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import { assets, issueEvidence, providerEvents, videoAssets } from "@/db/schema";
import { VIDEO_EVIDENCE_COMMON_LIMITS } from "@/lib/billing/plans";
import {
  VIDEO_FAILURE_REASONS,
  type VideoFailureReason,
} from "@/lib/video/failure-reasons";

export const MUX_PROVIDER = "mux";

type MuxWebhookEvent = {
  id: string;
  type: string;
  created_at: string;
  data: unknown;
};

const TERMINAL_STATUSES = new Set<string>(["ready", "needs_attention", "failed"]);

type VideoRecord = {
  id: string;
  workspaceId: string;
  evidenceId: string | null;
  originalAssetId: string;
  processingStatus: string;
  providerUploadId: string | null;
  providerAssetId: string | null;
  providerPlaybackId: string | null;
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

async function loadVideoById(videoAssetId: string): Promise<VideoRecord | null> {
  const [row] = await db
    .select({
      id: videoAssets.id,
      workspaceId: videoAssets.workspaceId,
      evidenceId: videoAssets.evidenceId,
      originalAssetId: videoAssets.originalAssetId,
      processingStatus: videoAssets.processingStatus,
      providerUploadId: videoAssets.providerUploadId,
      providerAssetId: videoAssets.providerAssetId,
      providerPlaybackId: videoAssets.providerPlaybackId,
    })
    .from(videoAssets)
    .where(eq(videoAssets.id, videoAssetId))
    .limit(1);
  return row ?? null;
}

async function loadVideoByProviderAssetId(providerAssetId: string): Promise<VideoRecord | null> {
  const [row] = await db
    .select({
      id: videoAssets.id,
      workspaceId: videoAssets.workspaceId,
      evidenceId: videoAssets.evidenceId,
      originalAssetId: videoAssets.originalAssetId,
      processingStatus: videoAssets.processingStatus,
      providerUploadId: videoAssets.providerUploadId,
      providerAssetId: videoAssets.providerAssetId,
      providerPlaybackId: videoAssets.providerPlaybackId,
    })
    .from(videoAssets)
    .where(eq(videoAssets.providerAssetId, providerAssetId))
    .limit(1);
  return row ?? null;
}

async function loadVideoByProviderUploadId(providerUploadId: string): Promise<VideoRecord | null> {
  const [row] = await db
    .select({
      id: videoAssets.id,
      workspaceId: videoAssets.workspaceId,
      evidenceId: videoAssets.evidenceId,
      originalAssetId: videoAssets.originalAssetId,
      processingStatus: videoAssets.processingStatus,
      providerUploadId: videoAssets.providerUploadId,
      providerAssetId: videoAssets.providerAssetId,
      providerPlaybackId: videoAssets.providerPlaybackId,
    })
    .from(videoAssets)
    .where(eq(videoAssets.providerUploadId, providerUploadId))
    .limit(1);
  return row ?? null;
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

async function markFailure(
  video: VideoRecord,
  reason: VideoFailureReason,
  options?: { clearPlayback?: boolean },
) {
  const now = new Date();
  await db.transaction(async (tx) => {
    await tx
      .update(videoAssets)
      .set({
        processingStatus: "failed",
        failureReason: reason,
        providerPlaybackId: options?.clearPlayback ? null : video.providerPlaybackId,
        updatedAt: now,
      })
      .where(
        and(eq(videoAssets.id, video.id), eq(videoAssets.workspaceId, video.workspaceId)),
      );

    await tx
      .update(assets)
      .set({
        status: "failed",
        failureReason: reason,
        updatedAt: now,
      })
      .where(
        and(eq(assets.id, video.originalAssetId), eq(assets.workspaceId, video.workspaceId)),
      );

    if (video.evidenceId) {
      await tx
        .update(issueEvidence)
        .set({
          captureStatus: "failed",
        })
        .where(
          and(
            eq(issueEvidence.id, video.evidenceId),
            eq(issueEvidence.workspaceId, video.workspaceId),
          ),
        );
    }
  });
}

async function markNeedsAttention(video: VideoRecord, durationMs: number) {
  const now = new Date();
  await db.transaction(async (tx) => {
    await tx
      .update(videoAssets)
      .set({
        processingStatus: "needs_attention",
        failureReason: VIDEO_FAILURE_REASONS.duration_exceeded,
        durationMs,
        providerPlaybackId: null,
        updatedAt: now,
      })
      .where(
        and(eq(videoAssets.id, video.id), eq(videoAssets.workspaceId, video.workspaceId)),
      );

    await tx
      .update(assets)
      .set({
        status: "needs_attention",
        failureReason: VIDEO_FAILURE_REASONS.duration_exceeded,
        durationMs,
        updatedAt: now,
      })
      .where(
        and(eq(assets.id, video.originalAssetId), eq(assets.workspaceId, video.workspaceId)),
      );

    if (video.evidenceId) {
      await tx
        .update(issueEvidence)
        .set({
          captureStatus: "unavailable",
        })
        .where(
          and(
            eq(issueEvidence.id, video.evidenceId),
            eq(issueEvidence.workspaceId, video.workspaceId),
          ),
        );
    }
  });
}

async function markProcessing(
  video: VideoRecord,
  input: { providerUploadId?: string | null; providerAssetId?: string | null },
) {
  if (TERMINAL_STATUSES.has(video.processingStatus)) {
    // Still persist provider IDs if missing, without downgrading status.
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
        .where(
          and(eq(videoAssets.id, video.id), eq(videoAssets.workspaceId, video.workspaceId)),
        );
    }
    return;
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
      .where(
        and(eq(videoAssets.id, video.id), eq(videoAssets.workspaceId, video.workspaceId)),
      );

    await tx
      .update(assets)
      .set({
        status: "processing",
        failureReason: null,
        updatedAt: now,
      })
      .where(
        and(eq(assets.id, video.originalAssetId), eq(assets.workspaceId, video.workspaceId)),
      );

    if (video.evidenceId) {
      await tx
        .update(issueEvidence)
        .set({
          captureStatus: "pending",
        })
        .where(
          and(
            eq(issueEvidence.id, video.evidenceId),
            eq(issueEvidence.workspaceId, video.workspaceId),
          ),
        );
    }
  });
}

async function markReady(
  video: VideoRecord,
  input: {
    providerAssetId: string;
    providerPlaybackId: string;
    durationSeconds: number;
    providerUploadId?: string | null;
  },
) {
  if (video.processingStatus === "failed" && video.providerPlaybackId === null) {
    // Deleted or previously failed assets must not be revived by late ready events
    // when they were provider-deleted. Duration failures use needs_attention.
    const [current] = await db
      .select({ failureReason: videoAssets.failureReason })
      .from(videoAssets)
      .where(eq(videoAssets.id, video.id))
      .limit(1);
    if (current?.failureReason === VIDEO_FAILURE_REASONS.provider_deleted) {
      return;
    }
  }

  const durationMs = Math.round(input.durationSeconds * 1_000);
  if (input.durationSeconds > VIDEO_EVIDENCE_COMMON_LIMITS.maxClipDurationSeconds) {
    await db
      .update(videoAssets)
      .set({
        providerAssetId: input.providerAssetId,
        providerUploadId: video.providerUploadId ?? input.providerUploadId ?? null,
        updatedAt: new Date(),
      })
      .where(
        and(eq(videoAssets.id, video.id), eq(videoAssets.workspaceId, video.workspaceId)),
      );
    await markNeedsAttention(
      {
        ...video,
        providerAssetId: input.providerAssetId,
        providerUploadId: video.providerUploadId ?? input.providerUploadId ?? null,
      },
      durationMs,
    );
    return;
  }

  const now = new Date();
  await db.transaction(async (tx) => {
    await tx
      .update(videoAssets)
      .set({
        processingStatus: "ready",
        failureReason: null,
        durationMs,
        providerAssetId: input.providerAssetId,
        providerPlaybackId: input.providerPlaybackId,
        providerUploadId: video.providerUploadId ?? input.providerUploadId ?? null,
        updatedAt: now,
      })
      .where(
        and(eq(videoAssets.id, video.id), eq(videoAssets.workspaceId, video.workspaceId)),
      );

    await tx
      .update(assets)
      .set({
        status: "ready",
        failureReason: null,
        durationMs,
        updatedAt: now,
      })
      .where(
        and(eq(assets.id, video.originalAssetId), eq(assets.workspaceId, video.workspaceId)),
      );

    if (video.evidenceId) {
      await tx
        .update(issueEvidence)
        .set({
          captureStatus: "ready",
          capturedAt: now,
        })
        .where(
          and(
            eq(issueEvidence.id, video.evidenceId),
            eq(issueEvidence.workspaceId, video.workspaceId),
          ),
        );
    }
  });
}

async function markDeleted(video: VideoRecord) {
  await markFailure(video, VIDEO_FAILURE_REASONS.provider_deleted, { clearPlayback: true });
}

async function claimProviderEvent(input: {
  providerEventId: string;
  eventType: string;
  eventCreatedAt: Date | null;
  workspaceId?: string | null;
  videoAssetId?: string | null;
}): Promise<"claimed" | "duplicate"> {
  const inserted = await db
    .insert(providerEvents)
    .values({
      provider: MUX_PROVIDER,
      providerEventId: input.providerEventId,
      eventType: input.eventType,
      eventCreatedAt: input.eventCreatedAt,
      workspaceId: input.workspaceId ?? null,
      videoAssetId: input.videoAssetId ?? null,
    })
    .onConflictDoNothing({
      target: [providerEvents.provider, providerEvents.providerEventId],
    })
    .returning({ id: providerEvents.id });

  return inserted.length > 0 ? "claimed" : "duplicate";
}

export type MuxWebhookProcessResult =
  | { ok: true; status: "processed" | "ignored" | "duplicate" }
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

export async function processMuxWebhookEvent(
  event: MuxWebhookEvent,
): Promise<MuxWebhookProcessResult> {
  const eventCreatedAt = parseEventCreatedAt(event.created_at);
  const data = asRecord(event.data);

  switch (event.type) {
    case "video.upload.asset_created": {
      const uploadId = asString(data.id);
      const providerAssetId = asString(data.asset_id);
      const settings = asRecord(data.new_asset_settings);
      const passthrough = asString(settings.passthrough);

      if (!uploadId) {
        await claimProviderEvent({
          providerEventId: event.id,
          eventType: event.type,
          eventCreatedAt,
        });
        return { ok: true, status: "ignored" };
      }

      const video =
        (passthrough ? await loadVideoById(passthrough) : null) ??
        (await loadVideoByProviderUploadId(uploadId));

      if (!video) {
        await claimProviderEvent({
          providerEventId: event.id,
          eventType: event.type,
          eventCreatedAt,
        });
        return { ok: true, status: "ignored" };
      }

      if (!identifiersMatch(video, { providerUploadId: uploadId, providerAssetId })) {
        await claimProviderEvent({
          providerEventId: event.id,
          eventType: event.type,
          eventCreatedAt,
          workspaceId: video.workspaceId,
          videoAssetId: video.id,
        });
        return { ok: true, status: "ignored" };
      }

      const claim = await claimProviderEvent({
        providerEventId: event.id,
        eventType: event.type,
        eventCreatedAt,
        workspaceId: video.workspaceId,
        videoAssetId: video.id,
      });
      if (claim === "duplicate") return { ok: true, status: "duplicate" };

      await markProcessing(video, {
        providerUploadId: uploadId,
        providerAssetId,
      });
      return { ok: true, status: "processed" };
    }

    case "video.asset.ready": {
      const providerAssetId = asString(data.id);
      const passthrough = asString(data.passthrough);
      const playbackId = signedPlaybackId(
        data.playback_ids as Array<{ id: string; policy: string }> | undefined,
      );
      const durationSeconds = asNumber(data.duration);
      const uploadId = asString(data.upload_id);

      if (!providerAssetId) {
        await claimProviderEvent({
          providerEventId: event.id,
          eventType: event.type,
          eventCreatedAt,
        });
        return { ok: true, status: "ignored" };
      }

      const video =
        (passthrough ? await loadVideoById(passthrough) : null) ??
        (await loadVideoByProviderAssetId(providerAssetId));

      if (!video || durationSeconds == null || !playbackId) {
        await claimProviderEvent({
          providerEventId: event.id,
          eventType: event.type,
          eventCreatedAt,
          workspaceId: video?.workspaceId,
          videoAssetId: video?.id,
        });
        return { ok: true, status: "ignored" };
      }

      if (
        !identifiersMatch(video, {
          providerAssetId,
          providerUploadId: uploadId,
        })
      ) {
        await claimProviderEvent({
          providerEventId: event.id,
          eventType: event.type,
          eventCreatedAt,
          workspaceId: video.workspaceId,
          videoAssetId: video.id,
        });
        return { ok: true, status: "ignored" };
      }

      const claim = await claimProviderEvent({
        providerEventId: event.id,
        eventType: event.type,
        eventCreatedAt,
        workspaceId: video.workspaceId,
        videoAssetId: video.id,
      });
      if (claim === "duplicate") return { ok: true, status: "duplicate" };

      await markReady(video, {
        providerAssetId,
        providerPlaybackId: playbackId,
        durationSeconds,
        providerUploadId: uploadId,
      });
      return { ok: true, status: "processed" };
    }

    case "video.asset.errored": {
      const providerAssetId = asString(data.id);
      const passthrough = asString(data.passthrough);
      const uploadId = asString(data.upload_id);

      if (!providerAssetId) {
        await claimProviderEvent({
          providerEventId: event.id,
          eventType: event.type,
          eventCreatedAt,
        });
        return { ok: true, status: "ignored" };
      }

      const video =
        (passthrough ? await loadVideoById(passthrough) : null) ??
        (await loadVideoByProviderAssetId(providerAssetId));

      if (!video) {
        await claimProviderEvent({
          providerEventId: event.id,
          eventType: event.type,
          eventCreatedAt,
        });
        return { ok: true, status: "ignored" };
      }

      if (!identifiersMatch(video, { providerAssetId, providerUploadId: uploadId })) {
        await claimProviderEvent({
          providerEventId: event.id,
          eventType: event.type,
          eventCreatedAt,
          workspaceId: video.workspaceId,
          videoAssetId: video.id,
        });
        return { ok: true, status: "ignored" };
      }

      const claim = await claimProviderEvent({
        providerEventId: event.id,
        eventType: event.type,
        eventCreatedAt,
        workspaceId: video.workspaceId,
        videoAssetId: video.id,
      });
      if (claim === "duplicate") return { ok: true, status: "duplicate" };

      if (video.processingStatus === "ready") {
        // Do not corrupt a ready asset with a late error for a mismatched race;
        // only fail non-ready states.
        return { ok: true, status: "ignored" };
      }

      await db
        .update(videoAssets)
        .set({
          providerAssetId: video.providerAssetId ?? providerAssetId,
          providerUploadId: video.providerUploadId ?? uploadId,
          updatedAt: new Date(),
        })
        .where(
          and(eq(videoAssets.id, video.id), eq(videoAssets.workspaceId, video.workspaceId)),
        );

      await markFailure(
        {
          ...video,
          providerAssetId: video.providerAssetId ?? providerAssetId,
        },
        VIDEO_FAILURE_REASONS.processing_failed,
        { clearPlayback: true },
      );
      return { ok: true, status: "processed" };
    }

    case "video.asset.deleted": {
      const providerAssetId = asString(data.id);
      const passthrough = asString(data.passthrough);

      const video =
        (passthrough ? await loadVideoById(passthrough) : null) ??
        (providerAssetId ? await loadVideoByProviderAssetId(providerAssetId) : null);

      const claim = await claimProviderEvent({
        providerEventId: event.id,
        eventType: event.type,
        eventCreatedAt,
        workspaceId: video?.workspaceId,
        videoAssetId: video?.id,
      });
      if (claim === "duplicate") return { ok: true, status: "duplicate" };

      if (!video || !providerAssetId) {
        return { ok: true, status: "ignored" };
      }

      if (!identifiersMatch(video, { providerAssetId })) {
        return { ok: true, status: "ignored" };
      }

      await markDeleted(video);
      return { ok: true, status: "processed" };
    }

    default: {
      await claimProviderEvent({
        providerEventId: event.id,
        eventType: event.type,
        eventCreatedAt,
      });
      return { ok: true, status: "ignored" };
    }
  }
}
