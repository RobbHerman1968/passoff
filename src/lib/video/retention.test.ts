import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { db } from "@/db";
import {
  activityEvents,
  issueComments,
  issues,
  notifications,
  videoAssets,
} from "@/db/schema";
import { createVideoNote } from "@/lib/video/annotations/service";
import { processPendingProviderDeletions } from "@/lib/video/provider-deletion";
import {
  expireRetainedVideos,
  runVideoRetention,
  videoRetentionEnd,
  warnAboutExpiringVideos,
} from "@/lib/video/retention";
import { transitionIssue } from "@/lib/issues/service";
import { getWorkspaceVideoUsage } from "@/lib/video/usage";
import { getIssueVideoView } from "@/lib/video/issue-video";
import { seedReviewWithIssue, seedVideoEvidence } from "@/test/workspace-fixtures";

// These tests need TEST_DATABASE_URL. They never use DATABASE_URL, and never call Mux.

const mux = vi.hoisted(() => ({ deleteMuxAsset: vi.fn(), cancelMuxUpload: vi.fn() }));

vi.mock("@/lib/video/mux", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/video/mux")>();
  return { ...original, deleteMuxAsset: mux.deleteMuxAsset, cancelMuxUpload: mux.cancelMuxUpload };
});

const DAY = 24 * 60 * 60 * 1000;

async function seedClip(label: string) {
  const seeded = await seedReviewWithIssue(label);
  const clip = await seedVideoEvidence({
    workspaceId: seeded.context.workspaceId,
    reviewId: seeded.reviewId,
    issueId: seeded.issueId,
    status: "ready",
    durationMs: 60_000,
    uploadedByUserId: seeded.context.userId,
  });
  return { ...seeded, clip };
}

async function issueVersion(issueId: string) {
  const [row] = await db.select({ version: issues.version }).from(issues).where(eq(issues.id, issueId));
  return row.version;
}

async function closeIssue(seeded: Awaited<ReturnType<typeof seedClip>>) {
  const result = await transitionIssue(seeded.context, {
    issueId: seeded.issueId,
    version: await issueVersion(seeded.issueId),
    status: "closed",
    closureReason: "not_planned",
  });
  expect(result.ok).toBe(true);
}

async function reopenIssue(seeded: Awaited<ReturnType<typeof seedClip>>) {
  const result = await transitionIssue(seeded.context, {
    issueId: seeded.issueId,
    version: await issueVersion(seeded.issueId),
    status: "open",
  });
  expect(result.ok).toBe(true);
}

async function loadClip(id: string) {
  const [row] = await db.select().from(videoAssets).where(eq(videoAssets.id, id));
  return row;
}

describe("video retention", { timeout: 120_000 }, () => {
  beforeEach(() => {
    mux.deleteMuxAsset.mockReset().mockResolvedValue({ done: true });
    mux.cancelMuxUpload.mockReset().mockResolvedValue({ done: true });
  });

  it("keeps clips on an open issue with no removal date", async () => {
    const seeded = await seedClip("RetOpen");
    expect((await loadClip(seeded.clip.videoAssetId)).retentionEndsAt).toBeNull();
    const view = await getIssueVideoView(seeded.context, seeded.scope);
    expect(view?.retention).toEqual({ state: "kept", endsAt: null, daysLeft: null });
  });

  it("sets the removal date 30 days after closing, and clears it on reopen", async () => {
    const seeded = await seedClip("RetCloseReopen");
    const before = Date.now();
    await closeIssue(seeded);
    const closed = await loadClip(seeded.clip.videoAssetId);
    expect(closed.retentionEndsAt).not.toBeNull();
    const delta = (closed.retentionEndsAt as Date).getTime() - before;
    expect(delta).toBeGreaterThan(29.9 * DAY);
    expect(delta).toBeLessThan(30.1 * DAY);
    expect(closed.retentionEndsAt).toEqual(
      videoRetentionEnd((await db.select().from(issues).where(eq(issues.id, seeded.issueId)))[0].closedAt as Date),
    );

    await reopenIssue(seeded);
    expect((await loadClip(seeded.clip.videoAssetId)).retentionEndsAt).toBeNull();
  });

  it("removes only the stored video after the period: comments, notes, and the issue stay", async () => {
    const seeded = await seedClip("RetExpire");
    await createVideoNote(seeded.context, {
      ...seeded.scope,
      videoAssetId: seeded.clip.videoAssetId,
      timestampMs: 5_000,
      body: "Stays after the video is gone",
    });
    await closeIssue(seeded);
    const future = new Date(Date.now() + 31 * DAY);

    const summary = await expireRetainedVideos({ now: future });
    expect(summary.expired).toBeGreaterThanOrEqual(1);

    const row = await loadClip(seeded.clip.videoAssetId);
    expect(row).toMatchObject({ lifecycle: "removed", removalReason: "retention_expired" });
    expect(row.providerDeleteRequestedAt).not.toBeNull();
    expect(mux.deleteMuxAsset).toHaveBeenCalled();

    const comments = await db.select().from(issueComments).where(eq(issueComments.issueId, seeded.issueId));
    expect(comments).toHaveLength(1);
    const [issue] = await db.select().from(issues).where(eq(issues.id, seeded.issueId));
    expect(issue.status).toBe("closed");

    const view = await getIssueVideoView(seeded.context, seeded.scope);
    expect(view?.current).toBeNull();
    expect(view?.tombstone).not.toBeNull();

    const history = await db
      .select({ type: activityEvents.type })
      .from(activityEvents)
      .where(eq(activityEvents.issueId, seeded.issueId));
    expect(history.map((event) => event.type)).toContain("issue.video_expired");

    // Running again does nothing more.
    const again = await expireRetainedVideos({ now: future });
    expect(again.expired).toBe(0);
  });

  it("does not remove a clip before its date, or after the issue was reopened", async () => {
    const early = await seedClip("RetEarly");
    await closeIssue(early);
    await expireRetainedVideos({ now: new Date(Date.now() + 10 * DAY) });
    expect((await loadClip(early.clip.videoAssetId)).lifecycle).toBe("current");

    const reopened = await seedClip("RetReopened");
    await closeIssue(reopened);
    await reopenIssue(reopened);
    await expireRetainedVideos({ now: new Date(Date.now() + 40 * DAY) });
    expect((await loadClip(reopened.clip.videoAssetId)).lifecycle).toBe("current");
  });

  it("clears a stale date on an issue that is no longer closed instead of removing the clip", async () => {
    const seeded = await seedClip("RetStale");
    await db
      .update(videoAssets)
      .set({ retentionEndsAt: new Date(Date.now() - DAY) })
      .where(eq(videoAssets.id, seeded.clip.videoAssetId));
    await expireRetainedVideos({ now: new Date() });
    const row = await loadClip(seeded.clip.videoAssetId);
    expect(row.lifecycle).toBe("current");
    expect(row.retentionEndsAt).toBeNull();
  });

  it("retries a failed provider deletion later and records the tombstone either way", async () => {
    const seeded = await seedClip("RetRetry");
    await closeIssue(seeded);
    mux.deleteMuxAsset.mockResolvedValue({ done: false, code: "provider_error" });
    const future = new Date(Date.now() + 31 * DAY);
    await expireRetainedVideos({ now: future });

    let row = await loadClip(seeded.clip.videoAssetId);
    expect(row.lifecycle).toBe("removed");
    expect(row.providerDeletedAt).toBeNull();
    expect(row.providerDeleteLastError).toBe("provider_error");
    expect(row.providerDeleteNextAttemptAt).not.toBeNull();

    mux.deleteMuxAsset.mockResolvedValue({ done: true });
    const later = new Date(Date.now() + 365 * DAY);
    // A generous limit: the job is global, and the shared test database can hold other pending rows.
    await processPendingProviderDeletions({ now: later, limit: 1000 });
    row = await loadClip(seeded.clip.videoAssetId);
    expect(row.providerDeletedAt).not.toBeNull();
  });

  it("warns once per removal date, and again after a close, reopen and close", async () => {
    const seeded = await seedClip("RetWarn");
    await closeIssue(seeded);
    const soon = new Date(Date.now() + 25 * DAY);

    const first = await warnAboutExpiringVideos({ now: soon });
    expect(first.warned).toBeGreaterThanOrEqual(1);
    const notices = async () =>
      (
        await db
          .select({ id: notifications.id, type: notifications.type, data: notifications.data })
          .from(notifications)
          .where(eq(notifications.issueId, seeded.issueId))
      ).filter((row) => row.type === "issue.video_retention_warning");
    const afterFirst = await notices();
    expect(afterFirst).toHaveLength(1);
    expect(JSON.stringify(afterFirst[0].data)).not.toMatch(/playback_|asset_|upload_/);

    await warnAboutExpiringVideos({ now: soon });
    expect(await notices()).toHaveLength(1);

    await reopenIssue(seeded);
    expect((await warnAboutExpiringVideos({ now: soon })).warned).toBe(0);
    await closeIssue(seeded);
    await db
      .update(videoAssets)
      .set({ retentionEndsAt: new Date(soon.getTime() + 3 * DAY) })
      .where(eq(videoAssets.id, seeded.clip.videoAssetId));
    await warnAboutExpiringVideos({ now: soon });
    expect(await notices()).toHaveLength(2);
  });

  it("does not warn about clips that are far from removal or on open issues", async () => {
    const open = await seedClip("RetNoWarnOpen");
    const far = await seedClip("RetNoWarnFar");
    await closeIssue(far);
    await warnAboutExpiringVideos({ now: new Date() });
    for (const seeded of [open, far]) {
      const rows = await db.select().from(notifications).where(eq(notifications.issueId, seeded.issueId));
      expect(rows.filter((row) => row.type === "issue.video_retention_warning")).toHaveLength(0);
    }
  });

  it("runs expiry and warnings together for the scheduled job", async () => {
    const result = await runVideoRetention({ now: new Date() });
    expect(result).toHaveProperty("expiry");
    expect(result).toHaveProperty("warnings");
  });

  describe("allowance accounting", () => {
    it("counts a ready clip, and stops counting it once it is removed or expired", async () => {
      const seeded = await seedClip("UsageReady");
      const counted = await getWorkspaceVideoUsage(db, seeded.context.workspaceId);
      expect(counted.retainedSeconds).toBe(60);

      await closeIssue(seeded);
      await expireRetainedVideos({ now: new Date(Date.now() + 31 * DAY) });
      const after = await getWorkspaceVideoUsage(db, seeded.context.workspaceId);
      expect(after.retainedSeconds).toBe(0);
    });

    it("does not retain failed or needs-attention uploads", async () => {
      const seeded = await seedReviewWithIssue("UsageFailed");
      await seedVideoEvidence({
        workspaceId: seeded.context.workspaceId,
        reviewId: seeded.reviewId,
        issueId: seeded.issueId,
        status: "failed",
        durationMs: 90_000,
        failureReason: "upload_failed",
      });
      await seedVideoEvidence({
        workspaceId: seeded.context.workspaceId,
        reviewId: seeded.reviewId,
        issueId: seeded.issueId,
        status: "needs_attention",
        lifecycle: "retired",
        durationMs: 90_000,
      });
      const usage = await getWorkspaceVideoUsage(db, seeded.context.workspaceId);
      expect(usage.retainedSeconds).toBe(0);
    });
  });
});
