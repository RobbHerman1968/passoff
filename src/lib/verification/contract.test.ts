import { describe, expect, it } from "vitest";

import {
  isAllowedHookName,
  overallFromChecks,
  overlapDecision,
  OVERLAP_THRESHOLDS,
} from "@/lib/verification/contract";
import { parseHookAllowlist } from "@/lib/verification/eligibility";
import { sanitizeCheckedUrl, sanitizeSummary } from "@/lib/verification/sanitize";

describe("verification contract", () => {
  it("passes, fails, and stays uncertain around overlap thresholds", () => {
    expect(overlapDecision(0)).toBe("passed");
    expect(overlapDecision(10)).toBe("passed");
    expect(overlapDecision(OVERLAP_THRESHOLDS.passedMaxPercent)).toBe("uncertain");
    expect(overlapDecision(30)).toBe("uncertain");
    expect(overlapDecision(OVERLAP_THRESHOLDS.failedMinPercent)).toBe("uncertain");
    expect(overlapDecision(80)).toBe("failed");
    expect(overlapDecision(Number.NaN)).toBe("uncertain");
  });

  it("calculates overall result without treating passed as issue verification", () => {
    expect(overallFromChecks(["passed", "passed"])).toBe("passed");
    expect(overallFromChecks(["passed", "failed"])).toBe("failed");
    expect(overallFromChecks(["passed", "uncertain"])).toBe("uncertain");
    expect(overallFromChecks([])).toBe("uncertain");
  });

  it("validates named hook names and rejects html summaries", () => {
    expect(isAllowedHookName("checkout-ready")).toBe(true);
    expect(isAllowedHookName("Checkout")).toBe(false);
    expect(isAllowedHookName("eval(alert(1))")).toBe(false);
    expect(parseHookAllowlist("checkout-ready\nNotAllowed!\nform-ready")).toEqual([
      "checkout-ready",
      "form-ready",
    ]);
    expect(sanitizeSummary("<script>alert(1)</script>bad")).toBe("alert(1)bad");
  });

  it("strips tokens from checked URLs", () => {
    expect(
      sanitizeCheckedUrl("https://example.com/app?token=secret&page=1#hash"),
    ).toBe("https://example.com/app?page=1");
  });
});
