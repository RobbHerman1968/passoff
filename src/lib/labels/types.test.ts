import { describe, expect, it } from "vitest";

import {
  LABEL_NAME_MAX_LENGTH,
  normalizeLabelColor,
  normalizeLabelName,
} from "@/lib/labels/types";

describe("label names and colors", () => {
  it("trims and collapses whitespace", () => {
    expect(normalizeLabelName("  Needs   copy\tedit \n")).toEqual({
      ok: true,
      name: "Needs copy edit",
    });
  });

  it("asks for a name and enforces the length limit", () => {
    expect(normalizeLabelName("   ").ok).toBe(false);
    expect(normalizeLabelName(null).ok).toBe(false);
    const tooLong = normalizeLabelName("x".repeat(LABEL_NAME_MAX_LENGTH + 1));
    expect(tooLong.ok).toBe(false);
    expect(normalizeLabelName("x".repeat(LABEL_NAME_MAX_LENGTH)).ok).toBe(true);
  });

  it("falls back to a neutral color for unknown values", () => {
    expect(normalizeLabelColor("blue")).toBe("blue");
    expect(normalizeLabelColor("#ff0000")).toBe("slate");
    expect(normalizeLabelColor(undefined)).toBe("slate");
  });
});
