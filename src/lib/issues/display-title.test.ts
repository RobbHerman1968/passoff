import { describe, expect, it } from "vitest";

import { deriveIssueDisplayTitle } from "@/lib/issues/display-title";

describe("deriveIssueDisplayTitle", () => {
  it("uses the first meaningful line and collapses whitespace", () => {
    expect(
      deriveIssueDisplayTitle("  Header   overlaps\nnavigation bar  "),
    ).toBe("Header overlaps");
  });

  it("truncates long titles consistently", () => {
    const title = deriveIssueDisplayTitle("a".repeat(100), 20);
    expect(title).toHaveLength(20);
    expect(title.endsWith("…")).toBe(true);
  });

  it("falls back when the body has no meaningful text", () => {
    expect(deriveIssueDisplayTitle("\n\n  \n")).toBe("Untitled issue");
  });
});
