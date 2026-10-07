import { describe, expect, it } from "vitest";

import {
  VIDEO_UPLOAD_STALE_MS,
  displayStateFor,
  formatClipDuration,
  isAcceptedVideoMimeType,
  nextPollDelayMs,
  removalReasonFor,
  tombstoneText,
  videoLimitsSentence,
  videoStateLabel,
  viewNeedsPolling,
  worstUsageLevel,
} from "@/lib/video/states";

const now = new Date("2026-05-10T12:00:00Z");
const fresh = new Date(now.getTime() - 60_000);

describe("displayStateFor", () => {
  it("maps stored statuses to plain states", () => {
    const base = { lifecycle: "current", createdAt: fresh };
    expect(displayStateFor({ ...base, processingStatus: "ready" }, now)).toBe("ready");
    expect(displayStateFor({ ...base, processingStatus: "processing" }, now)).toBe("processing");
    expect(displayStateFor({ ...base, processingStatus: "uploading" }, now)).toBe("uploading");
    expect(displayStateFor({ ...base, processingStatus: "pending" }, now)).toBe("uploading");
    expect(displayStateFor({ ...base, processingStatus: "failed" }, now)).toBe("failed");
    expect(displayStateFor({ ...base, processingStatus: "needs_attention" }, now)).toBe(
      "needs_attention",
    );
  });

  it("treats removed and retired clips as removed whatever their status", () => {
    expect(
      displayStateFor({ lifecycle: "removed", processingStatus: "ready", createdAt: fresh }, now),
    ).toBe("removed");
    expect(
      displayStateFor({ lifecycle: "retired", processingStatus: "ready", createdAt: fresh }, now),
    ).toBe("removed");
  });

  it("treats an upload that never finished as failed, but never a ready clip", () => {
    const old = new Date(now.getTime() - VIDEO_UPLOAD_STALE_MS - 1_000);
    expect(
      displayStateFor({ lifecycle: "current", processingStatus: "uploading", createdAt: old }, now),
    ).toBe("failed");
    expect(
      displayStateFor({ lifecycle: "current", processingStatus: "pending", createdAt: old }, now),
    ).toBe("failed");
    expect(
      displayStateFor({ lifecycle: "current", processingStatus: "ready", createdAt: old }, now),
    ).toBe("ready");
    // A clip still being prepared by the provider is not an abandoned upload.
    expect(
      displayStateFor({ lifecycle: "current", processingStatus: "processing", createdAt: old }, now),
    ).toBe("processing");
  });
});

describe("file types and limits copy", () => {
  it("accepts MP4, MOV, and WebM only", () => {
    expect(isAcceptedVideoMimeType("video/mp4")).toBe(true);
    expect(isAcceptedVideoMimeType("VIDEO/QUICKTIME")).toBe(true);
    expect(isAcceptedVideoMimeType("video/webm")).toBe(true);
    expect(isAcceptedVideoMimeType("video/x-matroska")).toBe(false);
    expect(isAcceptedVideoMimeType("image/png")).toBe(false);
    expect(isAcceptedVideoMimeType("")).toBe(false);
  });

  it("states the limits from the product configuration in plain words", () => {
    const sentence = videoLimitsSentence();
    expect(sentence).toContain("3 minutes");
    expect(sentence).toContain("250 MB");
    expect(sentence).not.toMatch(/mux|bytes|mime/i);
  });
});

describe("polling", () => {
  it("polls only while a clip is uploading or being prepared", () => {
    const item = (state: "ready" | "processing" | "uploading" | "failed") =>
      ({ state }) as never;
    expect(viewNeedsPolling({ current: item("ready"), replacement: null })).toBe(false);
    expect(viewNeedsPolling({ current: item("ready"), replacement: item("processing") })).toBe(true);
    expect(viewNeedsPolling({ current: item("uploading"), replacement: null })).toBe(true);
    expect(viewNeedsPolling({ current: item("failed"), replacement: null })).toBe(false);
    expect(viewNeedsPolling({ current: null, replacement: null })).toBe(false);
  });

  it("slows down over time", () => {
    expect(nextPollDelayMs(0)).toBe(3_000);
    expect(nextPollDelayMs(5)).toBe(6_000);
    expect(nextPollDelayMs(40)).toBe(12_000);
  });
});

describe("labels and formatting", () => {
  it("never shows provider words in state labels", () => {
    for (const state of [
      "uploading",
      "processing",
      "ready",
      "needs_attention",
      "failed",
      "removed",
    ] as const) {
      expect(videoStateLabel(state)).not.toMatch(/mux|asset|webhook|errored/i);
    }
  });

  it("formats clip length as minutes and seconds", () => {
    expect(formatClipDuration(83)).toBe("1:23");
    expect(formatClipDuration(5)).toBe("0:05");
    expect(formatClipDuration(null)).toBe("");
    expect(formatClipDuration(Number.NaN)).toBe("");
  });

  it("picks the more serious usage level", () => {
    expect(worstUsageLevel("available", "nearly_full")).toBe("nearly_full");
    expect(worstUsageLevel("full", "approaching")).toBe("full");
  });
});

describe("tombstoneText", () => {
  it("names who removed the video and when", () => {
    expect(
      tombstoneText({
        videoAssetId: "v",
        removedAt: "2026-03-04T10:00:00Z",
        removedByName: "Sam",
        reason: "removed",
        cleanupPending: false,
      }),
    ).toBe("Video removed on Mar 4, 2026 by Sam.");
  });

  it("explains expiry using the retention period", () => {
    const text = tombstoneText({
      videoAssetId: "v",
      removedAt: "2026-03-04T10:00:00Z",
      removedByName: null,
      reason: "expired",
      cleanupPending: false,
    });
    expect(text).toContain("30-day retention period");
  });
});

describe("removalReasonFor", () => {
  it("only leaves a removed-video record for clips that were ready", () => {
    expect(removalReasonFor("current", "ready")).toBe("deleted_by_member");
    expect(removalReasonFor("current", "uploading")).toBe("upload_abandoned");
    expect(removalReasonFor("current", "processing")).toBe("upload_abandoned");
    expect(removalReasonFor("current", "failed")).toBe("needs_attention");
    expect(removalReasonFor("current", "needs_attention")).toBe("needs_attention");
    expect(removalReasonFor("replacement", "ready")).toBe("replacement_cancelled");
  });
});
