import { describe, expect, it } from "vitest";

import { clusterHeatmapIssues, issueWeight } from "@/lib/heatmap/cluster";
import type { HeatmapIssueInput } from "@/lib/heatmap/cluster";

function issue(overrides: Partial<HeatmapIssueInput>): HeatmapIssueInput {
  return {
    id: overrides.id ?? "1",
    number: overrides.number ?? 1,
    title: "Button contrast",
    status: "open",
    priority: "normal",
    assigneeDisplayName: null,
    groupLabel: "Sign-up form",
    x: 100,
    y: 100,
    ...overrides,
  };
}

describe("heatmap clustering", () => {
  it("does not guess positions for unresolved anchors", () => {
    const result = clusterHeatmapIssues(
      [
        issue({ id: "a", number: 1, x: 10, y: 10 }),
        issue({ id: "b", number: 2, x: null, y: null, groupLabel: "Missing" }),
      ],
      "equal",
    );
    expect(result.located).toBe(1);
    expect(result.unresolved.map((item) => item.id)).toEqual(["b"]);
    expect(result.hotspots.every((hotspot) => Number.isFinite(hotspot.x))).toBe(true);
  });

  it("weights urgent issues more than low when priority weighting is on", () => {
    expect(issueWeight("urgent", "priority")).toBeGreaterThan(issueWeight("high", "priority"));
    expect(issueWeight("high", "priority")).toBeGreaterThan(issueWeight("normal", "priority"));
    expect(issueWeight("normal", "priority")).toBeGreaterThan(issueWeight("low", "priority"));
    expect(issueWeight("urgent", "equal")).toBe(issueWeight("low", "equal"));
  });

  it("groups nearby issues deterministically", () => {
    const result = clusterHeatmapIssues(
      [
        issue({ id: "a", number: 3, x: 10, y: 10 }),
        issue({ id: "b", number: 1, x: 12, y: 11 }),
        issue({ id: "c", number: 2, x: 400, y: 400, groupLabel: "Footer" }),
      ],
      "equal",
    );
    expect(result.hotspots).toHaveLength(2);
    expect(result.hotspots[0]?.issues.map((item) => item.number)).toEqual([1, 3]);
  });

  it("summarizes overflow beyond the safe location limit", () => {
    const many = Array.from({ length: 85 }, (_, index) =>
      issue({
        id: String(index),
        number: index + 1,
        x: index * 200,
        y: index * 200,
        groupLabel: `Area ${index}`,
      }),
    );
    const result = clusterHeatmapIssues(many, "equal");
    expect(result.hotspots).toHaveLength(80);
    expect(result.unresolved.length).toBe(5);
  });
});
