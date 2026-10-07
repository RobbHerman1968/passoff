import { describe, expect, it } from "vitest";

import { FREE_VIDEO_EVIDENCE_LIMITS } from "@/lib/billing/plans";
import {
  VIDEO_DURATION_TOLERANCE_MS,
  checkMeasuredClip,
  maxHeightFromTracks,
  measuredClipFitsAllowance,
  measuredLengthNeedsAllowanceCheck,
} from "@/lib/video/validation";

describe("checkMeasuredClip", () => {
  it("allows a clip at exactly three minutes and 1080p", () => {
    expect(checkMeasuredClip({ durationSeconds: 180, maxHeight: 1080 })).toEqual({ ok: true });
  });

  it("rejects clips longer than three minutes", () => {
    expect(checkMeasuredClip({ durationSeconds: 180.5, maxHeight: 720 })).toEqual({
      ok: false,
      reason: "duration_exceeded",
    });
  });

  it("rejects clips taller than 1080p", () => {
    expect(checkMeasuredClip({ durationSeconds: 20, maxHeight: 1440 })).toEqual({
      ok: false,
      reason: "resolution_exceeded",
    });
  });

  it("does not fail a clip when the height is unknown", () => {
    expect(checkMeasuredClip({ durationSeconds: 20, maxHeight: null })).toEqual({ ok: true });
  });

  it("rejects a missing or invalid length", () => {
    expect(checkMeasuredClip({ durationSeconds: Number.NaN, maxHeight: null }).ok).toBe(false);
  });
});

describe("measuredLengthNeedsAllowanceCheck", () => {
  it("rechecks when Mux measures a clearly longer clip than the browser said", () => {
    expect(measuredLengthNeedsAllowanceCheck(60_000, 60_000 + VIDEO_DURATION_TOLERANCE_MS + 1)).toBe(
      true,
    );
    expect(measuredLengthNeedsAllowanceCheck(60_000, 60_000 + VIDEO_DURATION_TOLERANCE_MS)).toBe(
      false,
    );
    expect(measuredLengthNeedsAllowanceCheck(60_000, 30_000)).toBe(false);
  });

  it("always rechecks when no length was declared", () => {
    expect(measuredLengthNeedsAllowanceCheck(null, 1_000)).toBe(true);
  });
});

describe("measuredClipFitsAllowance", () => {
  const limits = FREE_VIDEO_EVIDENCE_LIMITS;

  it("fits when both the monthly and retained totals stay in the plan", () => {
    expect(
      measuredClipFitsAllowance({
        limits,
        measuredDurationSeconds: 120,
        otherNewSecondsThisMonth: 60,
        otherRetainedSeconds: 60,
      }),
    ).toEqual({ ok: true });
  });

  it("rejects when this month's new video time would be exceeded", () => {
    expect(
      measuredClipFitsAllowance({
        limits,
        measuredDurationSeconds: 120,
        otherNewSecondsThisMonth: limits.newUploadMinutesPerCalendarMonth * 60 - 100,
        otherRetainedSeconds: 0,
      }),
    ).toEqual({ ok: false, reason: "allowance_exceeded" });
  });

  it("rejects when retained video would be exceeded", () => {
    expect(
      measuredClipFitsAllowance({
        limits,
        measuredDurationSeconds: 120,
        otherNewSecondsThisMonth: 0,
        otherRetainedSeconds: limits.retainedMinutes * 60 - 100,
      }),
    ).toEqual({ ok: false, reason: "allowance_exceeded" });
  });

  it("rejects when the plan has no approved allowance", () => {
    expect(
      measuredClipFitsAllowance({
        limits: null,
        measuredDurationSeconds: 1,
        otherNewSecondsThisMonth: 0,
        otherRetainedSeconds: 0,
      }).ok,
    ).toBe(false);
  });
});

describe("maxHeightFromTracks", () => {
  it("returns the tallest video track and ignores audio", () => {
    expect(
      maxHeightFromTracks([
        { type: "audio", max_channels: 2 },
        { type: "video", max_height: 720 },
        { type: "video", max_height: 1080 },
      ]),
    ).toBe(1080);
  });

  it("returns null for missing or malformed tracks", () => {
    expect(maxHeightFromTracks(undefined)).toBeNull();
    expect(maxHeightFromTracks([null, "x", { type: "video" }])).toBeNull();
  });
});
