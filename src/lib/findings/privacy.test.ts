import { describe, expect, it } from "vitest";

import {
  buildSafeAiInput,
  aiInputContainsProhibitedFields,
  redactIssueText,
} from "@/lib/findings/ai-input";
import { FORBIDDEN_AI_INPUT_KEYS } from "@/lib/findings/ai-schema";
import { buildEvidenceSnapshotPayload, snapshotContainsProhibitedFields } from "@/lib/findings/snapshot";

describe("behavioral evidence snapshot", () => {
  it("stores aggregate fields only", () => {
    const payload = buildEvidenceSnapshotPayload({
      id: "f1",
      workspaceId: "w1",
      projectId: "p1",
      environmentId: "e1",
      findingType: "repeat_click_concentration",
      ruleVersion: "1.0.0",
      scopeKey: "key",
      title: "Visitors repeatedly clicked checkout.",
      explanation: "18 of 142 eligible sessions included repeated clicks.",
      uncertainty: "Repeated clicks do not prove that the control is broken.",
      normalizedRoute: "/checkout",
      deploymentVersion: "v18",
      viewportGroup: "mobile",
      windowStart: new Date("2026-10-01T00:00:00.000Z"),
      windowEnd: new Date("2026-10-07T00:00:00.000Z"),
      elementCategory: "button",
      analyticsLabel: "checkout-button",
      metricName: "repeat_click_session_rate",
      metricValue: "0.127000",
      denominatorName: "eligible_sessions",
      denominatorValue: 142,
      eventCount: 40,
      eligibleSessionCount: 142,
      samplingPercent: 100,
      coverageStatus: "data_available",
      dataQuality: "meets_minimum_sample",
      disposition: "needs_review",
      relatedIssueId: null,
      relatedReviewId: null,
      createdAt: new Date("2026-10-07T00:00:00.000Z"),
      updatedAt: new Date("2026-10-07T00:00:00.000Z"),
    });
    expect(snapshotContainsProhibitedFields(payload)).toBe(false);
    expect(payload.eligibleSessionCount).toBe(142);
    expect(JSON.stringify(payload)).not.toMatch(/ip|cookie|email|rawEvents/i);
  });
});

describe("AI input contract", () => {
  it("excludes prohibited fields and redacts issue text", () => {
    const input = buildSafeAiInput({
      findingType: "repeat_click_concentration",
      metricName: "repeat_click_session_rate",
      metricValue: 0.127,
      denominatorName: "eligible_sessions",
      denominatorValue: 142,
      eligibleSessionCount: 142,
      coverageStatus: "data_available",
      environmentKind: "production",
      normalizedRoute: "/checkout",
      deploymentVersion: "v18",
      viewportGroup: "mobile",
      elementCategory: "button",
      analyticsLabel: "checkout-button",
      errorCategory: "",
      issueTitle: "Checkout clicks",
      redactedIssueDescription: redactIssueText("Contact me at person@example.com"),
      previousVerificationOutcomes: ["uncertain"],
      comparisonSummary: "",
    });
    expect(aiInputContainsProhibitedFields(input)).toBe(false);
    expect(input.redactedIssueDescription).toContain("[redacted]");
    for (const key of FORBIDDEN_AI_INPUT_KEYS) {
      expect(key in input).toBe(false);
    }
  });
});
