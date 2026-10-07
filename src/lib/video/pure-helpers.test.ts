import { describe, expect, it } from "vitest";

import { safeVideoEventData } from "@/lib/video/event-data";
import { userMessageForVideoFailure } from "@/lib/video/failure-reasons";
import { nextProviderDeleteBackoffMs } from "@/lib/video/provider-backoff";
import { videoEvidenceExportSummary } from "@/lib/issues/export-format";
import { ISSUE_ACTIVITY_TYPES, GUEST_SAFE_ISSUE_ACTIVITY_TYPES } from "@/lib/issues/history";

describe("provider deletion backoff", () => {
  it("waits longer after each failure and caps at six hours", () => {
    const waits = [1, 2, 3, 4, 5, 6, 7, 50].map(nextProviderDeleteBackoffMs);
    expect(waits).toEqual([
      60_000,
      300_000,
      900_000,
      3_600_000,
      10_800_000,
      21_600_000,
      21_600_000,
      21_600_000,
    ]);
  });

  it("starts at the shortest wait for a first or invalid attempt count", () => {
    expect(nextProviderDeleteBackoffMs(0)).toBe(60_000);
    expect(nextProviderDeleteBackoffMs(-3)).toBe(60_000);
  });
});

describe("safeVideoEventData", () => {
  it("carries only a kind, a rounded length, and a short code", () => {
    expect(
      safeVideoEventData({ kind: "ready", durationSeconds: 41.6, replacedPrevious: true }),
    ).toEqual({ kind: "ready", durationSeconds: 42, replacedPrevious: true });
    expect(
      safeVideoEventData({ kind: "needs_attention", failureReason: "duration_exceeded" }),
    ).toEqual({ kind: "needs_attention", failureReason: "duration_exceeded" });
  });

  it("never includes ids, links, or tokens even when handed extra fields", () => {
    const data = safeVideoEventData({
      kind: "ready",
      durationSeconds: 10,
      // Extra fields must be dropped, not copied.
      ...({ providerAssetId: "asset_secret", playbackToken: "jwt", url: "https://x" } as object),
    });
    expect(JSON.stringify(data)).not.toMatch(/asset_secret|jwt|https|playback/i);
  });
});

describe("failure copy", () => {
  it("never leaks provider details", () => {
    for (const reason of [
      "processing_failed",
      "duration_exceeded",
      "resolution_exceeded",
      "allowance_exceeded",
      "provider_deleted",
      "upload_failed",
      "something raw from mux: 500",
      null,
    ]) {
      const text = userMessageForVideoFailure(reason);
      expect(text).not.toMatch(/mux|\b[45]\d\d\b|asset_|errored/i);
      expect(text.length).toBeGreaterThan(10);
    }
  });
});

describe("export summary", () => {
  it("mentions the video without any link or token", () => {
    const text = videoEvidenceExportSummary(83);
    expect(text).toContain("1:23");
    expect(text).not.toMatch(/https?:|token|playback|mux/i);
    expect(videoEvidenceExportSummary(null)).toContain("A video is attached.");
  });
});

describe("issue history for video", () => {
  const guestSafe: readonly string[] = GUEST_SAFE_ISSUE_ACTIVITY_TYPES;
  it("lets guests see added, replaced, and removed but not failures", () => {
    expect(guestSafe.includes(ISSUE_ACTIVITY_TYPES.VIDEO_ADDED)).toBe(true);
    expect(guestSafe.includes(ISSUE_ACTIVITY_TYPES.VIDEO_REPLACED)).toBe(true);
    expect(guestSafe.includes(ISSUE_ACTIVITY_TYPES.VIDEO_REMOVED)).toBe(true);
    expect(guestSafe.includes(ISSUE_ACTIVITY_TYPES.VIDEO_NEEDS_ATTENTION)).toBe(false);
  });
});
