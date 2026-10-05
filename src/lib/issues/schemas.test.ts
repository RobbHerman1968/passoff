import { describe, expect, it } from "vitest";

import {
  issueListHasActiveFilters,
  parseIssueListSearchParams,
} from "@/lib/issues/schemas";

describe("issue list URL filters", () => {
  it("defaults to active issues on page 1", () => {
    expect(parseIssueListSearchParams({})).toEqual({
      q: "",
      show: "active",
      p: 1,
    });
  });

  it("ignores invalid values safely", () => {
    const parsed = parseIssueListSearchParams({
      show: "nope",
      priority: "critical",
      issue: "abc",
      p: "0",
      video: "maybe",
    });
    expect(parsed.show).toBe("active");
    expect(parsed.priority).toBeUndefined();
    expect(parsed.issue).toBeUndefined();
    expect(parsed.p).toBe(1);
    expect(parsed.video).toBeUndefined();
  });

  it("accepts valid filter values from the URL", () => {
    const parsed = parseIssueListSearchParams({
      q: " header ",
      show: "verified",
      priority: "high",
      assignee: "unassigned",
      page: "/pricing",
      video: "1",
      issue: "12",
      p: "2",
    });
    expect(parsed).toMatchObject({
      q: "header",
      show: "verified",
      priority: "high",
      assignee: "unassigned",
      page: "/pricing",
      video: true,
      issue: 12,
      p: 2,
    });
    expect(issueListHasActiveFilters(parsed)).toBe(true);
  });
});
