import { randomUUID } from "node:crypto";

import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { db } from "@/db";
import { issues, reviews, videoAssets } from "@/db/schema";
import { createIssue } from "@/lib/issues/service";
import {
  attachProviderUpload,
  discardReservation,
  reserveVideoUpload,
  VIDEO_ARCHIVED_MESSAGE,
  VIDEO_BUSY_MESSAGE,
  VIDEO_CLOSED_MESSAGE,
} from "@/lib/video/upload-service";
import { seedReviewWithIssue, seedVideoEvidence } from "@/test/workspace-fixtures";

// These tests need TEST_DATABASE_URL. They never use DATABASE_URL.

const MB = 1024 * 1024;

function input(issueId: string, overrides: Partial<Parameters<typeof reserveVideoUpload>[1]> = {}) {
  return {
    issueId,
    fileName: "bug.mp4",
    mimeType: "video/mp4",
    fileBytes: 5 * MB,
    durationSeconds: 30,
    ...overrides,
  };
}

async function rowsFor(issueId: string) {
  return db.select().from(videoAssets).where(eq(videoAssets.issueId, issueId));
}

describe("reserveVideoUpload", { timeout: 60_000 }, () => {
  it("reserves a first clip as the current video, pending until the upload starts", async () => {
    const seeded = await seedReviewWithIssue("VidAdd");
    const result = await reserveVideoUpload(seeded.context, input(seeded.issueId));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.reservation.mode).toBe("add");

    const [row] = await rowsFor(seeded.issueId);
    expect(row).toMatchObject({
      lifecycle: "current",
      processingStatus: "pending",
      declaredDurationMs: 30_000,
      declaredBytes: 5 * MB,
      providerUploadId: null,
    });

    const providerUploadId = `upload_${randomUUID()}`;
    await attachProviderUpload(seeded.context, result.reservation, providerUploadId);
    const [attached] = await rowsFor(seeded.issueId);
    expect(attached).toMatchObject({ processingStatus: "uploading", providerUploadId });
  });

  it("refuses files that are the wrong type, too long, or too large", async () => {
    const seeded = await seedReviewWithIssue("VidLimits");
    const wrongType = await reserveVideoUpload(
      seeded.context,
      input(seeded.issueId, { mimeType: "application/pdf" }),
    );
    expect(wrongType).toMatchObject({ ok: false, code: "invalid_file", status: 400 });

    const tooLong = await reserveVideoUpload(
      seeded.context,
      input(seeded.issueId, { durationSeconds: 181 }),
    );
    expect(tooLong).toMatchObject({ ok: false, status: 400 });

    const tooBig = await reserveVideoUpload(
      seeded.context,
      input(seeded.issueId, { fileBytes: 251 * MB }),
    );
    expect(tooBig).toMatchObject({ ok: false, status: 400 });

    // Nothing was saved for refused uploads.
    expect(await rowsFor(seeded.issueId)).toHaveLength(0);
  });

  it("does not let another workspace reserve video for this issue", async () => {
    const owner = await seedReviewWithIssue("VidOwnerA");
    const other = await seedReviewWithIssue("VidOwnerB");
    const result = await reserveVideoUpload(other.context, input(owner.issueId));
    expect(result).toMatchObject({ ok: false, code: "not_found", status: 404 });
    expect(await rowsFor(owner.issueId)).toHaveLength(0);
  });

  it("is read-only for archived reviews", async () => {
    const seeded = await seedReviewWithIssue("VidArchived");
    await db.update(reviews).set({ archivedAt: new Date() }).where(eq(reviews.id, seeded.reviewId));
    const result = await reserveVideoUpload(seeded.context, input(seeded.issueId));
    expect(result).toMatchObject({ ok: false, code: "archived", message: VIDEO_ARCHIVED_MESSAGE });
  });

  it("asks to reopen a closed issue", async () => {
    const seeded = await seedReviewWithIssue("VidClosed");
    await db
      .update(issues)
      .set({ status: "closed", closureReason: "not_planned", closedAt: new Date() })
      .where(eq(issues.id, seeded.issueId));
    const result = await reserveVideoUpload(seeded.context, input(seeded.issueId));
    expect(result).toMatchObject({ ok: false, code: "closed", message: VIDEO_CLOSED_MESSAGE });
  });

  it("allows only one upload at a time, even when two start together", async () => {
    const seeded = await seedReviewWithIssue("VidRace");
    const results = await Promise.all([
      reserveVideoUpload(seeded.context, input(seeded.issueId)),
      reserveVideoUpload(seeded.context, input(seeded.issueId)),
      reserveVideoUpload(seeded.context, input(seeded.issueId)),
    ]);
    expect(results.filter((result) => result.ok)).toHaveLength(1);
    for (const result of results.filter((item) => !item.ok)) {
      expect(result).toMatchObject({ ok: false, code: "busy", message: VIDEO_BUSY_MESSAGE });
    }
    const active = (await rowsFor(seeded.issueId)).filter((row) => row.lifecycle === "current");
    expect(active).toHaveLength(1);
  });

  it("keeps the ready clip and reserves a replacement beside it", async () => {
    const seeded = await seedReviewWithIssue("VidReplace");
    const ready = await seedVideoEvidence({
      workspaceId: seeded.context.workspaceId,
      reviewId: seeded.reviewId,
      issueId: seeded.issueId,
      status: "ready",
      durationMs: 30_000,
      uploadedByUserId: seeded.context.userId,
    });
    const result = await reserveVideoUpload(seeded.context, input(seeded.issueId));
    expect(result).toMatchObject({ ok: true });
    if (!result.ok) return;
    expect(result.reservation.mode).toBe("replace");

    const rows = await rowsFor(seeded.issueId);
    expect(rows.find((row) => row.id === ready.videoAssetId)).toMatchObject({
      lifecycle: "current",
      processingStatus: "ready",
    });
    expect(rows.find((row) => row.id === result.reservation.videoAssetId)).toMatchObject({
      lifecycle: "replacement",
      processingStatus: "pending",
    });

    // A second replacement can't start while one is still arriving.
    const second = await reserveVideoUpload(seeded.context, input(seeded.issueId));
    expect(second).toMatchObject({ ok: false, code: "busy" });
  });

  it("supersedes an earlier failed attempt and queues its stored copy for deletion", async () => {
    const seeded = await seedReviewWithIssue("VidRetry");
    const failed = await seedVideoEvidence({
      workspaceId: seeded.context.workspaceId,
      reviewId: seeded.reviewId,
      issueId: seeded.issueId,
      status: "needs_attention",
      failureReason: "duration_exceeded",
    });
    const result = await reserveVideoUpload(seeded.context, input(seeded.issueId));
    expect(result.ok).toBe(true);

    const [old] = await db.select().from(videoAssets).where(eq(videoAssets.id, failed.videoAssetId));
    expect(old.lifecycle).toBe("retired");
    expect(old.providerDeleteRequestedAt).not.toBeNull();
  });

  it("treats an upload that was never finished as abandoned, not busy", async () => {
    const seeded = await seedReviewWithIssue("VidStale");
    await seedVideoEvidence({
      workspaceId: seeded.context.workspaceId,
      reviewId: seeded.reviewId,
      issueId: seeded.issueId,
      status: "uploading",
      createdAt: new Date(Date.now() - 3 * 60 * 60 * 1000),
    });
    const result = await reserveVideoUpload(seeded.context, input(seeded.issueId));
    expect(result.ok).toBe(true);
  });

  it("enforces the plan's monthly allowance across issues, with a plain explanation", async () => {
    const seeded = await seedReviewWithIssue("VidAllowance");
    // The free plan includes 10 new minutes a month. Use up 9 of them on another issue.
    const other = await createIssue(seeded.context, {
      reviewId: seeded.reviewId,
      body: "Another issue",
    });
    if (!other.ok) throw new Error("issue failed");
    await seedVideoEvidence({
      workspaceId: seeded.context.workspaceId,
      reviewId: seeded.reviewId,
      issueId: other.issue.id,
      status: "ready",
      durationMs: 9 * 60_000,
    });

    const refused = await reserveVideoUpload(
      seeded.context,
      input(seeded.issueId, { durationSeconds: 120 }),
    );
    expect(refused).toMatchObject({ ok: false, code: "allowance", status: 400 });
    if (!refused.ok) expect(refused.message).not.toMatch(/mux|status|\b4\d\d\b/i);

    const fits = await reserveVideoUpload(
      seeded.context,
      input(seeded.issueId, { durationSeconds: 45 }),
    );
    expect(fits.ok).toBe(true);
  });

  it("allows two uploads on different issues to be reserved without blocking each other", async () => {
    const seeded = await seedReviewWithIssue("VidTwoIssues");
    const other = await createIssue(seeded.context, {
      reviewId: seeded.reviewId,
      body: "Another issue",
    });
    if (!other.ok) throw new Error("issue failed");
    const [a, b] = await Promise.all([
      reserveVideoUpload(seeded.context, input(seeded.issueId, { durationSeconds: 20 })),
      reserveVideoUpload(seeded.context, input(other.issue.id, { durationSeconds: 20 })),
    ]);
    expect(a.ok).toBe(true);
    expect(b.ok).toBe(true);
  });

  it("never lets several uploads started together squeeze past the monthly allowance", async () => {
    const seeded = await seedReviewWithIssue("VidConcurrentAllowance");
    const issueIds = [seeded.issueId];
    for (let index = 0; index < 3; index += 1) {
      const extra = await createIssue(seeded.context, {
        reviewId: seeded.reviewId,
        body: `Concurrent issue ${index}`,
      });
      if (!extra.ok) throw new Error("issue failed");
      issueIds.push(extra.issue.id);
    }
    // The free plan includes 10 new minutes a month: three 3-minute clips fit, a fourth does not.
    const results = await Promise.all(
      issueIds.map((issueId) =>
        reserveVideoUpload(seeded.context, input(issueId, { durationSeconds: 180 })),
      ),
    );
    expect(results.filter((result) => result.ok)).toHaveLength(3);
    const refused = results.filter((result) => !result.ok);
    expect(refused).toHaveLength(1);
    expect(refused[0]).toMatchObject({ ok: false, code: "allowance", status: 400 });
  });
});

describe("discardReservation", { timeout: 60_000 }, () => {
  it("removes a reservation that never reached the video service", async () => {
    const seeded = await seedReviewWithIssue("VidDiscard");
    const result = await reserveVideoUpload(seeded.context, input(seeded.issueId));
    if (!result.ok) throw new Error("reserve failed");
    await discardReservation(seeded.context, result.reservation);
    expect(await rowsFor(seeded.issueId)).toHaveLength(0);

    // The issue can immediately start again.
    expect((await reserveVideoUpload(seeded.context, input(seeded.issueId))).ok).toBe(true);
  });

  it("does not delete a reservation that already has a provider upload", async () => {
    const seeded = await seedReviewWithIssue("VidKeep");
    const result = await reserveVideoUpload(seeded.context, input(seeded.issueId));
    if (!result.ok) throw new Error("reserve failed");
    await attachProviderUpload(seeded.context, result.reservation, `upload_${randomUUID()}`);
    await discardReservation(seeded.context, result.reservation);
    const rows = await db
      .select({ id: videoAssets.id })
      .from(videoAssets)
      .where(
        and(
          eq(videoAssets.id, result.reservation.videoAssetId),
          eq(videoAssets.workspaceId, seeded.context.workspaceId),
        ),
      );
    expect(rows).toHaveLength(1);
  });
});
