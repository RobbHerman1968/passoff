import { describe, expect, it } from "vitest";

import { formatIssueHistorySummary } from "@/lib/issues/history";

describe("formatIssueHistorySummary", () => {
  it("uses human-readable status, priority, and assignment copy", () => {
    expect(
      formatIssueHistorySummary({
        type: "issue.status_changed",
        actorDisplayName: "Rob",
        data: { from: "open", to: "in_progress" },
      }),
    ).toBe("Rob changed status from Open to In progress.");

    expect(
      formatIssueHistorySummary({
        type: "issue.priority_changed",
        actorDisplayName: "Rob",
        data: { from: "normal", to: "high" },
      }),
    ).toBe("Rob set priority to High.");

    expect(
      formatIssueHistorySummary({
        type: "issue.assignee_changed",
        actorDisplayName: "Rob",
        data: {
          fromUserId: null,
          toUserId: "maya",
          fromDisplayName: null,
          toDisplayName: "Maya",
        },
      }),
    ).toBe("Rob assigned this issue to Maya.");

    expect(
      formatIssueHistorySummary({
        type: "issue.assignee_changed",
        actorDisplayName: "Rob",
        data: {
          fromUserId: "maya",
          toUserId: null,
          fromDisplayName: "Maya",
          toDisplayName: null,
        },
      }),
    ).toBe("Rob removed Maya as the assignee.");

    expect(
      formatIssueHistorySummary({
        type: "issue.assignee_changed",
        actorDisplayName: "Rob",
        data: {
          fromUserId: "maya",
          toUserId: "sam",
          fromDisplayName: "Maya",
          toDisplayName: "Sam",
        },
      }),
    ).toBe("Rob reassigned this issue from Maya to Sam.");
  });
});
