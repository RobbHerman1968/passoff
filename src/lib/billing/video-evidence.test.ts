import { describe, expect, it } from "vitest";

import { PLAN_ENTITLEMENTS } from "@/lib/billing/plans";
import {
  checkVideoEvidenceUpload,
  getVideoEvidenceRetentionEnd,
  getVideoUsageLevel,
} from "@/lib/billing/video-evidence";

describe("video evidence entitlements", () => {
  it("publishes the approved allowance for every plan", () => {
    expect(PLAN_ENTITLEMENTS.free.videoEvidence).toMatchObject({
      status: "approved",
      limits: {
        newUploadMinutesPerCalendarMonth: 10,
        retainedMinutes: 15,
        unlimitedReviewerPlayback: true,
      },
    });
    expect(PLAN_ENTITLEMENTS.studio.videoEvidence).toMatchObject({
      status: "approved",
      limits: {
        newUploadMinutesPerCalendarMonth: 30,
        retainedMinutes: 60,
        unlimitedReviewerPlayback: true,
      },
    });
    expect(PLAN_ENTITLEMENTS.agency.videoEvidence).toMatchObject({
      status: "approved",
      limits: {
        newUploadMinutesPerCalendarMonth: 60,
        retainedMinutes: 120,
        unlimitedReviewerPlayback: true,
      },
    });
  });

  it("accepts a clip that remains within both Agency allowances", () => {
    expect(
      checkVideoEvidenceUpload(PLAN_ENTITLEMENTS.agency.videoEvidence, {
        durationSeconds: 180,
        fileBytes: 250 * 1024 * 1024,
        uploadedSecondsThisMonth: 57 * 60,
        retainedSeconds: 117 * 60,
      }),
    ).toEqual({ allowed: true });
  });

  it("blocks a clip longer than three minutes", () => {
    expect(
      checkVideoEvidenceUpload(PLAN_ENTITLEMENTS.agency.videoEvidence, {
        durationSeconds: 181,
        fileBytes: 10 * 1024 * 1024,
        uploadedSecondsThisMonth: 0,
        retainedSeconds: 0,
      }),
    ).toMatchObject({ allowed: false, reason: "clip_too_long" });
  });

  it("blocks monthly and retained usage independently", () => {
    expect(
      checkVideoEvidenceUpload(PLAN_ENTITLEMENTS.free.videoEvidence, {
        durationSeconds: 60,
        fileBytes: 10 * 1024 * 1024,
        uploadedSecondsThisMonth: 10 * 60,
        retainedSeconds: 0,
      }),
    ).toMatchObject({ allowed: false, reason: "monthly_upload_limit" });

    expect(
      checkVideoEvidenceUpload(PLAN_ENTITLEMENTS.free.videoEvidence, {
        durationSeconds: 60,
        fileBytes: 10 * 1024 * 1024,
        uploadedSecondsThisMonth: 0,
        retainedSeconds: 15 * 60,
      }),
    ).toMatchObject({ allowed: false, reason: "retained_video_limit" });
  });

  it("expires evidence 30 days after an issue closes", () => {
    const closedAt = new Date("2026-10-04T12:00:00.000Z");
    const studio = PLAN_ENTITLEMENTS.studio.videoEvidence;
    expect(studio.status).toBe("approved");
    if (studio.status !== "approved") return;

    expect(
      getVideoEvidenceRetentionEnd(
        closedAt,
        studio.limits.retentionDaysAfterIssueCloses,
      ).toISOString(),
    ).toBe("2026-11-03T12:00:00.000Z");
  });

  it("reports warning levels at 75, 90, and 100 percent", () => {
    expect(getVideoUsageLevel(74, 100)).toBe("available");
    expect(getVideoUsageLevel(75, 100)).toBe("approaching");
    expect(getVideoUsageLevel(90, 100)).toBe("nearly_full");
    expect(getVideoUsageLevel(100, 100)).toBe("full");
  });
});
