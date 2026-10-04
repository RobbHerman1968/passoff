import { describe, expect, it } from "vitest";

import { comparisonPages } from "@/lib/comparisons";

describe("comparison content", () => {
  it("keeps every comparison distinct and source-backed", () => {
    expect(comparisonPages).toHaveLength(3);
    expect(new Set(comparisonPages.map((page) => page.slug)).size).toBe(
      comparisonPages.length,
    );
    expect(new Set(comparisonPages.map((page) => page.competitor)).size).toBe(
      comparisonPages.length,
    );

    for (const page of comparisonPages) {
      expect(page.rows.length).toBeGreaterThanOrEqual(6);
      expect(page.choosePassoff.length).toBeGreaterThanOrEqual(4);
      expect(page.chooseCompetitor.length).toBeGreaterThanOrEqual(4);
      expect(page.sources.length).toBeGreaterThanOrEqual(2);
      expect(page.sources.every((source) => source.href.startsWith("https://"))).toBe(true);
      expect(page.checkedOn).toBe("October 3, 2026");
    }
  });

  it("never declares a generic winner", () => {
    for (const page of comparisonPages) {
      const text = [page.shortAnswer, page.verdict].join(" ");
      expect(text).not.toMatch(/Passoff is (always |simply |clearly )?better/i);
      expect(text).toMatch(/choose|fit|choice/i);
    }
  });
});
