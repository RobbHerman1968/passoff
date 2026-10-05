import { describe, expect, it } from "vitest";

import {
  issueListHasActiveFilters,
  parseIssueListSearchParams,
  updateIssueAssigneeSchema,
  updateIssueStatusSchema,
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
      p: "0",
      video: "maybe",
    });
    expect(parsed.show).toBe("active");
    expect(parsed.priority).toBeUndefined();
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
      p: "2",
    });
    expect(parsed).toMatchObject({
      q: "header",
      show: "verified",
      priority: "high",
      assignee: "unassigned",
      page: "/pricing",
      video: true,
      p: 2,
    });
    expect(issueListHasActiveFilters(parsed)).toBe(true);
  });

  it("validates triage mutation payloads", () => {
    expect(
      updateIssueStatusSchema.safeParse({
        projectId: "not-a-uuid",
        reviewId: "11111111-1111-4111-8111-111111111111",
        issueNumber: 1,
        version: 1,
        status: "open",
      }).success,
    ).toBe(false);

    expect(
      updateIssueAssigneeSchema.safeParse({
        projectId: "11111111-1111-4111-8111-111111111111",
        reviewId: "11111111-1111-4111-8111-111111111111",
        issueNumber: 1,
        version: 1,
        assigneeUserId: null,
      }).success,
    ).toBe(true);
  });

  it("ignores obsolete issue query parameters", () => {
    const parsed = parseIssueListSearchParams({
      issue: "12",
      show: "active",
    });
    expect(parsed).toEqual({
      q: "",
      show: "active",
      p: 1,
    });
    expect("issue" in parsed).toBe(false);
  });
});
