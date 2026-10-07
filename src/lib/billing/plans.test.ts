import { describe, expect, it } from "vitest";

import { UNPUBLISHED_POOLED_METRICS } from "@/lib/billing/future-config";
import {
  AGENCY_TRIAL_DAYS,
  ANNUAL_SAVINGS_USD,
  PLAN_ENTITLEMENTS,
  POOLED_USAGE_METRICS,
  isPublishedAllowance,
} from "@/lib/billing/plans";

describe("plan entitlements", () => {
  it("keeps the existing Passoff prices and billing totals", () => {
    expect(PLAN_ENTITLEMENTS.free.monthlyPriceUsd).toBe(0);
    expect(PLAN_ENTITLEMENTS.studio.monthlyPriceUsd).toBe(35);
    expect(PLAN_ENTITLEMENTS.studio.annualMonthlyPriceUsd).toBe(29);
    expect(PLAN_ENTITLEMENTS.studio.annualTotalUsd).toBe(348);
    expect(PLAN_ENTITLEMENTS.agency.monthlyPriceUsd).toBe(109);
    expect(PLAN_ENTITLEMENTS.agency.annualMonthlyPriceUsd).toBe(89);
    expect(PLAN_ENTITLEMENTS.agency.annualTotalUsd).toBe(1068);
    expect(ANNUAL_SAVINGS_USD).toBe(240);
    expect(AGENCY_TRIAL_DAYS).toBe(14);
  });

  it("applies the approved workspace member and review-website limits", () => {
    expect(PLAN_ENTITLEMENTS.studio.workspaceMembers).toBe(3);
    expect(PLAN_ENTITLEMENTS.studio.activeReviewWebsites).toBe(5);
    expect(PLAN_ENTITLEMENTS.agency.workspaceMembers).toBe(6);
    expect(PLAN_ENTITLEMENTS.agency.activeReviewWebsites).toBe("unlimited");
    expect(PLAN_ENTITLEMENTS.free.unlimitedGuestReviewers).toBe(true);
    expect(PLAN_ENTITLEMENTS.studio.unlimitedIssuesAndComments).toBe(true);
  });

  it("publishes the approved video-evidence limits for every plan", () => {
    const freeVideo = PLAN_ENTITLEMENTS.free.videoEvidence;
    const studioVideo = PLAN_ENTITLEMENTS.studio.videoEvidence;
    const agencyVideo = PLAN_ENTITLEMENTS.agency.videoEvidence;

    expect(freeVideo).toMatchObject({
      status: "approved",
      limits: { newUploadMinutesPerCalendarMonth: 10, retainedMinutes: 15 },
    });
    expect(studioVideo).toMatchObject({
      status: "approved",
      limits: { newUploadMinutesPerCalendarMonth: 30, retainedMinutes: 60 },
    });
    expect(agencyVideo).toMatchObject({
      status: "approved",
      limits: { newUploadMinutesPerCalendarMonth: 60, retainedMinutes: 120 },
    });

    for (const policy of [freeVideo, studioVideo, agencyVideo]) {
      expect(policy.status).toBe("approved");
      if (policy.status !== "approved") continue;
      expect(policy.limits.maxClipDurationSeconds).toBe(180);
      expect(policy.limits.maxClipBytes).toBe(250 * 1024 * 1024);
      expect(policy.limits.maxQuality).toBe("1080p");
      expect(policy.limits.unlimitedReviewerPlayback).toBe(true);
      expect(policy.limits.retainWhileIssueIsActive).toBe(true);
      expect(policy.limits.retentionDaysAfterIssueCloses).toBe(30);
      expect(policy.limits.automaticOverageBilling).toBe(false);
    }
  });

  it("publishes unlimited playback while leaving other infrastructure metrics undecided", () => {
    expect(UNPUBLISHED_POOLED_METRICS).not.toContain("video_playback");
    expect(POOLED_USAGE_METRICS.video_playback.allowance).toEqual({ status: "unlimited" });
    expect(isPublishedAllowance(POOLED_USAGE_METRICS.video_playback.allowance)).toBe(true);
    expect(UNPUBLISHED_POOLED_METRICS).toContain("video_processing");
    expect(UNPUBLISHED_POOLED_METRICS).toContain("video_storage");
  });
});
