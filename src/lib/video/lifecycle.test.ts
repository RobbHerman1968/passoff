import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { db } from "@/db";
import { activityEvents, issues, reviews, videoAssets } from "@/db/schema";
import { getIssueVideoView } from "@/lib/video/issue-video";
import { removeIssueVideo } from "@/lib/video/removal-service";
import { processMuxWebhookEvent } from "@/lib/video/webhook-service";
import { seedReviewWithIssue, seedVideoEvidence } from "@/test/workspace-fixtures";

// These tests need TEST_DATABASE_URL. They never use DATABASE_URL, and never call Mux.

const mux = vi.hoisted(() => ({
  deleteMuxAsset: vi.fn(),
  cancelMuxUpload: vi.fn(),
}));

vi.mock("@/lib/video/mux", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/video/mux")>();
  return {
    ...original,
    deleteMuxAsset: mux.deleteMuxAsset,
    cancelMuxUpload: mux.cancelMuxUpload,
  };
});

const nowSeconds = () => String(Math.floor(Date.now() / 1000));

function readyEvent(
  video: { id: string; uploadId: string | null },
  overrides: { duration?: number; maxHeight?: number; eventId?: string } = {},
) {
  return {
    id: overrides.eventId ?? `evt_${randomUUID()}`,
    type: "video.asset.ready",
    created_at: nowSeconds(),
    data: {
      id: `asset_${randomUUID()}`,
      passthrough: video.id,
      upload_id: video.uploadId,
      duration: overrides.duration ?? 30,
      tracks: [{ type: "video", max_height: overrides.maxHeight ?? 720 }],
      playback_ids: [{ id: `playback_${randomUUID()}`, policy: "signed" }],
    },
  };
}

async function load(id: string) {
  const [row] = await db.select().from(videoAssets).where(eq(videoAssets.id, id));
  return row;
}

describe("video lifecycle", { timeout: 90_000 }, () => {
  beforeEach(() => {
    mux.deleteMuxAsset.mockReset().mockResolvedValue({ done: true });
    mux.cancelMuxUpload.mockReset().mockResolvedValue({ done: true });
  });

  describe("webhooks", () => {
    it("promotes a replacement only when it is ready, retiring the old clip in the same step", async () => {
      const seeded = await seedReviewWithIssue("LifePromote");
      const base = {
        workspaceId: seeded.context.workspaceId,
        reviewId: seeded.reviewId,
        issueId: seeded.issueId,
        uploadedByUserId: seeded.context.userId,
      };
      const oldClip = await seedVideoEvidence({ ...base, status: "ready" });
      const replacement = await seedVideoEvidence({
        ...base,
        status: "uploading",
        lifecycle: "replacement",
      });

      // While the replacement is still arriving, people still see the old clip.
      const during = await getIssueVideoView(seeded.context, seeded.scope);
      expect(during?.current?.videoAssetId).toBe(oldClip.videoAssetId);
      expect(during?.current?.state).toBe("ready");
      expect(during?.replacement?.state).toBe("uploading");

      const result = await processMuxWebhookEvent(
        readyEvent({ id: replacement.videoAssetId, uploadId: replacement.providerUploadId }),
      );
      expect(result).toMatchObject({ ok: true, status: "processed" });
      expect(result.ok && result.deleteVideoAssetId).toBe(oldClip.videoAssetId);

      expect(await load(replacement.videoAssetId)).toMatchObject({
        lifecycle: "current",
        processingStatus: "ready",
      });
      const old = await load(oldClip.videoAssetId);
      expect(old.lifecycle).toBe("retired");
      expect(old.removalReason).toBe("replaced");
      expect(old.providerDeleteRequestedAt).not.toBeNull();

      const rows = await db.select().from(videoAssets).where(eq(videoAssets.issueId, seeded.issueId));
      expect(rows.filter((row) => row.lifecycle === "current")).toHaveLength(1);

      const history = await db
        .select({ type: activityEvents.type, data: activityEvents.data })
        .from(activityEvents)
        .where(eq(activityEvents.issueId, seeded.issueId));
      const replaced = history.find((event) => event.type === "issue.video_replaced");
      expect(replaced).toBeTruthy();
      expect(JSON.stringify(replaced?.data)).not.toMatch(/asset_|playback_|upload_/);
    });

    it("sends a clip longer than three minutes to needs attention and never makes it playable", async () => {
      const seeded = await seedReviewWithIssue("LifeLong");
      const clip = await seedVideoEvidence({
        workspaceId: seeded.context.workspaceId,
        reviewId: seeded.reviewId,
        issueId: seeded.issueId,
        status: "processing",
        uploadedByUserId: seeded.context.userId,
      });
      const result = await processMuxWebhookEvent(
        readyEvent({ id: clip.videoAssetId, uploadId: clip.providerUploadId }, { duration: 200 }),
      );
      expect(result.ok && result.deleteVideoAssetId).toBe(clip.videoAssetId);
      const row = await load(clip.videoAssetId);
      expect(row).toMatchObject({
        processingStatus: "needs_attention",
        failureReason: "duration_exceeded",
        providerPlaybackId: null,
      });
      expect(row.providerDeleteRequestedAt).not.toBeNull();
    });

    it("sends a clip taller than 1080p to needs attention", async () => {
      const seeded = await seedReviewWithIssue("LifeTall");
      const clip = await seedVideoEvidence({
        workspaceId: seeded.context.workspaceId,
        reviewId: seeded.reviewId,
        issueId: seeded.issueId,
        status: "processing",
      });
      await processMuxWebhookEvent(
        readyEvent({ id: clip.videoAssetId, uploadId: clip.providerUploadId }, { maxHeight: 2160 }),
      );
      expect(await load(clip.videoAssetId)).toMatchObject({
        processingStatus: "needs_attention",
        failureReason: "resolution_exceeded",
        providerPlaybackId: null,
      });
    });

    it("rechecks the allowance when Mux measures a longer clip than the browser reported", async () => {
      const seeded = await seedReviewWithIssue("LifeAllowance");
      // Nine of the free plan's ten monthly minutes are already used by another clip.
      await seedVideoEvidence({
        workspaceId: seeded.context.workspaceId,
        reviewId: seeded.reviewId,
        issueId: seeded.issueId,
        status: "ready",
        durationMs: 9 * 60_000,
        lifecycle: "retired",
      });
      const clip = await seedVideoEvidence({
        workspaceId: seeded.context.workspaceId,
        reviewId: seeded.reviewId,
        issueId: seeded.issueId,
        status: "processing",
        durationMs: 10_000,
      });
      // Declared 10 seconds, measured 170 seconds.
      await processMuxWebhookEvent(
        readyEvent({ id: clip.videoAssetId, uploadId: clip.providerUploadId }, { duration: 170 }),
      );
      const row = await load(clip.videoAssetId);
      expect(row).toMatchObject({
        processingStatus: "needs_attention",
        failureReason: "allowance_exceeded",
        providerPlaybackId: null,
      });
    });

    it("ignores repeated events and never steps a ready clip backwards", async () => {
      const seeded = await seedReviewWithIssue("LifeIdem");
      const clip = await seedVideoEvidence({
        workspaceId: seeded.context.workspaceId,
        reviewId: seeded.reviewId,
        issueId: seeded.issueId,
        status: "uploading",
      });
      const event = readyEvent({ id: clip.videoAssetId, uploadId: clip.providerUploadId });
      expect((await processMuxWebhookEvent(event)).ok).toBe(true);
      expect(await processMuxWebhookEvent(event)).toMatchObject({ status: "duplicate" });

      // A late "errored" event for a clip that is already ready must not damage it.
      const late = await processMuxWebhookEvent({
        id: `evt_${randomUUID()}`,
        type: "video.asset.errored",
        created_at: nowSeconds(),
        data: { id: "asset_x", passthrough: clip.videoAssetId, errors: { type: "invalid_input" } },
      });
      expect(late.ok).toBe(true);
      expect((await load(clip.videoAssetId)).processingStatus).toBe("ready");
    });

    it("never lets a clip that was removed come back, and queues its stored copy for deletion", async () => {
      const seeded = await seedReviewWithIssue("LifeOrphan");
      const clip = await seedVideoEvidence({
        workspaceId: seeded.context.workspaceId,
        reviewId: seeded.reviewId,
        issueId: seeded.issueId,
        status: "uploading",
        lifecycle: "removed",
      });
      const result = await processMuxWebhookEvent({
        id: `evt_${randomUUID()}`,
        type: "video.upload.asset_created",
        created_at: nowSeconds(),
        data: {
          id: clip.providerUploadId,
          asset_id: `asset_${randomUUID()}`,
          new_asset_settings: { passthrough: clip.videoAssetId },
        },
      });
      expect(result.ok && result.deleteVideoAssetId).toBe(clip.videoAssetId);
      const row = await load(clip.videoAssetId);
      expect(row.lifecycle).toBe("removed");
      expect(row.providerAssetId).toBeTruthy();
      expect(row.providerDeleteRequestedAt).not.toBeNull();

      await processMuxWebhookEvent(
        readyEvent({ id: clip.videoAssetId, uploadId: clip.providerUploadId }),
      );
      const after = await load(clip.videoAssetId);
      expect(after.lifecycle).toBe("removed");
      expect(after.processingStatus).not.toBe("ready");
      expect(after.providerPlaybackId).toBeNull();
    });

    it("ignores an event whose passthrough isn't one of our ids", async () => {
      const result = await processMuxWebhookEvent({
        id: `evt_${randomUUID()}`,
        type: "video.asset.ready",
        created_at: nowSeconds(),
        data: { id: "asset_none", passthrough: "'; drop table video_assets; --", duration: 5 },
      });
      expect(result).toMatchObject({ ok: true, status: "ignored" });
    });
  });

  describe("removal", () => {
    it("removes a ready clip, leaves a record, keeps the issue, and deletes the stored copy", async () => {
      const seeded = await seedReviewWithIssue("LifeRemove");
      const clip = await seedVideoEvidence({
        workspaceId: seeded.context.workspaceId,
        reviewId: seeded.reviewId,
        issueId: seeded.issueId,
        status: "ready",
        uploadedByUserId: seeded.context.userId,
      });
      const result = await removeIssueVideo(seeded.context, {
        ...seeded.scope,
        videoAssetId: clip.videoAssetId,
      });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.view.current).toBeNull();
      expect(result.view.tombstone).toMatchObject({ reason: "removed" });
      expect(JSON.stringify(result.view)).not.toMatch(/asset_|playback_|upload_/);

      expect(mux.deleteMuxAsset).toHaveBeenCalledWith(clip.providerAssetId);
      const row = await load(clip.videoAssetId);
      expect(row).toMatchObject({ lifecycle: "removed", removalReason: "deleted_by_member" });
      expect(row.providerDeletedAt).not.toBeNull();

      const [issue] = await db.select({ id: issues.id }).from(issues).where(eq(issues.id, seeded.issueId));
      expect(issue).toBeTruthy();
    });

    it("keeps the current clip when a replacement upload is cancelled", async () => {
      const seeded = await seedReviewWithIssue("LifeCancel");
      const base = {
        workspaceId: seeded.context.workspaceId,
        reviewId: seeded.reviewId,
        issueId: seeded.issueId,
      };
      const current = await seedVideoEvidence({ ...base, status: "ready" });
      const replacement = await seedVideoEvidence({ ...base, status: "uploading", lifecycle: "replacement" });
      const result = await removeIssueVideo(seeded.context, {
        ...seeded.scope,
        videoAssetId: replacement.videoAssetId,
      });
      expect(result.ok).toBe(true);
      expect(mux.cancelMuxUpload).toHaveBeenCalledWith(replacement.providerUploadId);
      expect((await load(current.videoAssetId)).lifecycle).toBe("current");
      expect(await load(replacement.videoAssetId)).toMatchObject({
        lifecycle: "removed",
        removalReason: "replacement_cancelled",
      });
      if (result.ok) expect(result.view.tombstone).toBeNull();
    });

    it("does not leave a 'video removed' note when an unfinished upload is cancelled", async () => {
      const seeded = await seedReviewWithIssue("LifeAbandon");
      const clip = await seedVideoEvidence({
        workspaceId: seeded.context.workspaceId,
        reviewId: seeded.reviewId,
        issueId: seeded.issueId,
        status: "uploading",
      });
      const result = await removeIssueVideo(seeded.context, {
        ...seeded.scope,
        videoAssetId: clip.videoAssetId,
      });
      expect(result.ok && result.view.tombstone).toBeNull();
      expect((await load(clip.videoAssetId)).removalReason).toBe("upload_abandoned");
    });

    it("keeps trying when the stored copy can't be deleted yet, and says nothing scary", async () => {
      mux.deleteMuxAsset.mockResolvedValue({ done: false, code: "provider_error" });
      const seeded = await seedReviewWithIssue("LifeRetry");
      const clip = await seedVideoEvidence({
        workspaceId: seeded.context.workspaceId,
        reviewId: seeded.reviewId,
        issueId: seeded.issueId,
        status: "ready",
      });
      const result = await removeIssueVideo(seeded.context, {
        ...seeded.scope,
        videoAssetId: clip.videoAssetId,
      });
      // The person's action worked: the clip is gone from the issue.
      expect(result.ok).toBe(true);
      const failed = await load(clip.videoAssetId);
      expect(failed.providerDeletedAt).toBeNull();
      expect(failed.providerDeleteAttempts).toBe(1);
      expect(failed.providerDeleteLastError).toBe("provider_error");
      expect(failed.providerDeleteNextAttemptAt!.getTime()).toBeGreaterThan(Date.now());

      // Not due yet: nothing is attempted.
      const { processPendingProviderDeletions } = await import("@/lib/video/provider-deletion");
      mux.deleteMuxAsset.mockClear();
      await processPendingProviderDeletions({ limit: 100 });
      expect(mux.deleteMuxAsset).not.toHaveBeenCalledWith(clip.providerAssetId);

      // Later, it succeeds and is recorded.
      mux.deleteMuxAsset.mockResolvedValue({ done: true });
      await processPendingProviderDeletions({
        limit: 500,
        now: new Date(Date.now() + 2 * 60_000),
      });
      expect((await load(clip.videoAssetId)).providerDeletedAt).not.toBeNull();
    });

    it("refuses to change video on an archived review", async () => {
      const seeded = await seedReviewWithIssue("LifeArchivedRemove");
      const clip = await seedVideoEvidence({
        workspaceId: seeded.context.workspaceId,
        reviewId: seeded.reviewId,
        issueId: seeded.issueId,
        status: "ready",
      });
      await db.update(reviews).set({ archivedAt: new Date() }).where(eq(reviews.id, seeded.reviewId));
      const result = await removeIssueVideo(seeded.context, {
        ...seeded.scope,
        videoAssetId: clip.videoAssetId,
      });
      expect(result).toMatchObject({ ok: false });
      expect((await load(clip.videoAssetId)).lifecycle).toBe("current");
    });

    it("can't remove another workspace's video", async () => {
      const owner = await seedReviewWithIssue("LifeOwner");
      const other = await seedReviewWithIssue("LifeOther");
      const clip = await seedVideoEvidence({
        workspaceId: owner.context.workspaceId,
        reviewId: owner.reviewId,
        issueId: owner.issueId,
        status: "ready",
      });
      const result = await removeIssueVideo(other.context, {
        ...owner.scope,
        videoAssetId: clip.videoAssetId,
      });
      expect(result.ok).toBe(false);
      expect((await load(clip.videoAssetId)).lifecycle).toBe("current");
    });
  });

  describe("clean-up job", () => {
    it("retires uploads that never finished", async () => {
      const seeded = await seedReviewWithIssue("LifeSweep");
      const stale = await seedVideoEvidence({
        workspaceId: seeded.context.workspaceId,
        reviewId: seeded.reviewId,
        issueId: seeded.issueId,
        status: "uploading",
        createdAt: new Date(Date.now() - 3 * 60 * 60 * 1000),
      });
      const { sweepStaleVideoUploads } = await import("@/lib/video/provider-deletion");
      const summary = await sweepStaleVideoUploads({ limit: 500 });
      expect(summary.retired).toBeGreaterThanOrEqual(1);
      expect(await load(stale.videoAssetId)).toMatchObject({
        lifecycle: "retired",
        processingStatus: "failed",
        removalReason: "upload_abandoned",
      });
    });
  });

  describe("issue list", () => {
    it("counts a clip as video only while it is current and ready", async () => {
      const seeded = await seedReviewWithIssue("LifeHasVideo");
      const { listIssuesForReview } = await import("@/lib/issues/list");
      const hasVideo = async () =>
        (
          await listIssuesForReview(seeded.context, seeded.projectId, seeded.reviewId, {
            q: "",
            show: "all",
            video: true,
            p: 1,
          })
        )?.items.length === 1;

      expect(await hasVideo()).toBe(false);
      const clip = await seedVideoEvidence({
        workspaceId: seeded.context.workspaceId,
        reviewId: seeded.reviewId,
        issueId: seeded.issueId,
        status: "processing",
      });
      expect(await hasVideo()).toBe(false);
      await db.update(videoAssets).set({ processingStatus: "ready" }).where(eq(videoAssets.id, clip.videoAssetId));
      expect(await hasVideo()).toBe(true);
      await db.update(videoAssets).set({ lifecycle: "removed" }).where(eq(videoAssets.id, clip.videoAssetId));
      expect(await hasVideo()).toBe(false);
    });
  });
});
