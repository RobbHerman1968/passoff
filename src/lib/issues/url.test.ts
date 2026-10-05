import { describe, expect, it } from "vitest";

import {
  buildIssueDetailHref,
  buildIssueListHref,
  parseIssueNumberParam,
  resolveIssueListReturnHref,
} from "@/lib/issues/url";

describe("issue URL helpers", () => {
  it("builds list hrefs without an issue selection param", () => {
    expect(
      buildIssueListHref("/projects/p1/reviews/r1", {
        q: "header",
        show: "verified",
        priority: "high",
        p: 2,
      }),
    ).toBe(
      "/projects/p1/reviews/r1?q=header&show=verified&priority=high&p=2",
    );
  });

  it("builds detail hrefs with a safe return query", () => {
    expect(
      buildIssueDetailHref("p1", "r1", 3, {
        q: "header",
        show: "closed",
        p: 2,
      }),
    ).toBe(
      "/projects/p1/reviews/r1/issues/3?return=q%3Dheader%26show%3Dclosed%26p%3D2",
    );
  });

  it("restores validated list state from return and rejects unsafe values", () => {
    expect(
      resolveIssueListReturnHref(
        "p1",
        "r1",
        "q=header&show=verified&priority=high&p=2",
      ),
    ).toBe(
      "/projects/p1/reviews/r1?q=header&show=verified&priority=high&p=2",
    );

    expect(
      resolveIssueListReturnHref("p1", "r1", "https://evil.example/phish"),
    ).toBe("/projects/p1/reviews/r1");

    expect(resolveIssueListReturnHref("p1", "r1", "//evil.example")).toBe(
      "/projects/p1/reviews/r1",
    );

    expect(resolveIssueListReturnHref("p1", "r1", "/dashboard")).toBe(
      "/projects/p1/reviews/r1",
    );

    expect(
      resolveIssueListReturnHref("p1", "r1", "show=nope&priority=critical&p=0"),
    ).toBe("/projects/p1/reviews/r1");
  });

  it("parses issue numbers safely", () => {
    expect(parseIssueNumberParam("3")).toBe(3);
    expect(parseIssueNumberParam("0")).toBeNull();
    expect(parseIssueNumberParam("abc")).toBeNull();
    expect(parseIssueNumberParam("-1")).toBeNull();
  });
});
