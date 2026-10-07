import { describe, expect, it } from "vitest";

import { compareRates } from "@/lib/findings/compare";

describe("behavioral comparison", () => {
  it("suppresses below minimum sample", () => {
    expect(
      compareRates({
        baselineValue: 0.12,
        comparisonValue: 0.03,
        baselineSample: 4,
        comparisonSample: 40,
        minSample: 10,
        compatible: true,
      }).outcome,
    ).toBe("not_enough_data");
  });

  it("rejects incompatible layouts", () => {
    expect(
      compareRates({
        baselineValue: 0.12,
        comparisonValue: 0.03,
        baselineSample: 40,
        comparisonSample: 40,
        minSample: 10,
        compatible: false,
      }).outcome,
    ).toBe("incompatible");
  });

  it("reports improvement without claiming verification", () => {
    const result = compareRates({
      baselineValue: 0.127,
      comparisonValue: 0.031,
      baselineSample: 142,
      comparisonSample: 130,
      minSample: 10,
      compatible: true,
    });
    expect(result.outcome).toBe("appears_improved");
    expect(result.summary).toMatch(/does not verify/i);
  });
});
