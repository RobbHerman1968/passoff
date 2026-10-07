import { describe, expect, it } from "vitest";

import { FINDING_RULE_VERSION, evaluateFindingCandidates } from "@/lib/findings/rules";
import { FINDING_THRESHOLDS } from "@/lib/telemetry/limits";

function group(
  overrides: Partial<Parameters<typeof evaluateFindingCandidates>[0][number]>,
): Parameters<typeof evaluateFindingCandidates>[0][number] {
  return {
    normalizedRoute: "/checkout",
    deploymentVersion: "v18",
    viewportGroup: "mobile",
    eventType: "page_view",
    elementCategory: "",
    analyticsLabel: "",
    errorCategory: "",
    errorFingerprint: "",
    scrollMilestone: -1,
    eventCount: 100,
    tabSessionCount: 100,
    ...overrides,
  };
}

describe("finding detection rules", () => {
  it("enforces minimum sample", () => {
    const candidates = evaluateFindingCandidates(
      [
        group({ tabSessionCount: 8, eventCount: 8 }),
        group({
          eventType: "repeat_click_signal",
          analyticsLabel: "checkout-button",
          elementCategory: "button",
          tabSessionCount: 5,
          eventCount: 12,
        }),
      ],
      10,
    );
    expect(candidates).toHaveLength(0);
  });

  it("creates a versioned repeat-click finding above threshold", () => {
    const candidates = evaluateFindingCandidates(
      [
        group({}),
        group({
          eventType: "repeat_click_signal",
          analyticsLabel: "checkout-button",
          elementCategory: "button",
          tabSessionCount: 18,
          eventCount: 40,
        }),
      ],
      10,
    );
    expect(candidates).toHaveLength(1);
    expect(candidates[0]?.findingType).toBe("repeat_click_concentration");
    expect(candidates[0]?.scopeKey.startsWith(FINDING_RULE_VERSION)).toBe(true);
    expect(candidates[0]?.title).toMatch(/repeatedly clicked/i);
    expect(candidates[0]?.title).not.toMatch(/broken/i);
  });

  it("does not duplicate the same aggregate scope", () => {
    const candidates = evaluateFindingCandidates(
      [
        group({}),
        group({
          eventType: "repeat_click_signal",
          analyticsLabel: "checkout-button",
          elementCategory: "button",
          tabSessionCount: 18,
        }),
        group({
          eventType: "repeat_click_signal",
          analyticsLabel: "checkout-button",
          elementCategory: "button",
          tabSessionCount: 20,
        }),
      ],
      10,
    );
    expect(candidates.filter((item) => item.findingType === "repeat_click_concentration")).toHaveLength(1);
  });

  it("isolates route, version, and viewport", () => {
    const candidates = evaluateFindingCandidates(
      [
        group({ viewportGroup: "mobile" }),
        group({ viewportGroup: "desktop", tabSessionCount: 100 }),
        group({
          eventType: "repeat_click_signal",
          viewportGroup: "mobile",
          analyticsLabel: "checkout-button",
          tabSessionCount: 20,
        }),
        group({
          eventType: "repeat_click_signal",
          viewportGroup: "desktop",
          analyticsLabel: "checkout-button",
          tabSessionCount: 20,
        }),
      ],
      10,
    );
    expect(candidates).toHaveLength(2);
    expect(new Set(candidates.map((item) => item.viewportGroup))).toEqual(
      new Set(["mobile", "desktop"]),
    );
  });

  it("detects scroll drop-off between adjacent sections", () => {
    const candidates = evaluateFindingCandidates(
      [
        group({}),
        group({
          eventType: "scroll_milestone",
          scrollMilestone: 50,
          tabSessionCount: 80,
        }),
        group({
          eventType: "scroll_milestone",
          scrollMilestone: 75,
          tabSessionCount: 20,
        }),
      ],
      10,
    );
    expect(candidates.some((item) => item.findingType === "scroll_drop_off")).toBe(true);
    expect(candidates[0]?.uncertainty).toMatch(/does not prove/i);
  });

  it("detects material version change without claiming causation", () => {
    const candidates = evaluateFindingCandidates(
      [
        group({ deploymentVersion: "v18" }),
        group({ deploymentVersion: "v19" }),
        group({
          eventType: "repeat_click_signal",
          deploymentVersion: "v18",
          analyticsLabel: "checkout-button",
          tabSessionCount: 20,
        }),
        group({
          eventType: "repeat_click_signal",
          deploymentVersion: "v19",
          analyticsLabel: "checkout-button",
          tabSessionCount: 4,
        }),
      ],
      10,
    );
    const change = candidates.find((item) => item.findingType === "material_version_change");
    expect(change).toBeTruthy();
    expect(change?.uncertainty).toMatch(/not proof/i);
    expect(Math.abs(0.2 - FINDING_THRESHOLDS.repeatClickRate)).toBeGreaterThan(0);
  });
});
