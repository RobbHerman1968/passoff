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

  it("mentions attached production behavior", () => {
    expect(
      formatIssueHistorySummary({
        type: "behavioral_finding.attached",
        actorDisplayName: "Rob",
        data: {},
      }),
    ).toBe("Rob attached production behavior evidence to this issue.");
  });

  it("describes public replies and private notes plainly", () => {
    expect(
      formatIssueHistorySummary({
        type: "issue.comment_added",
        actorDisplayName: "Rob",
        data: {},
      }),
    ).toBe("Rob added a public reply.");

    expect(
      formatIssueHistorySummary({
        type: "issue.private_note_added",
        actorDisplayName: "Rob",
        data: {},
      }),
    ).toBe("Rob added a private note.");
  });

  it("describes label changes in plain language", () => {
    expect(
      formatIssueHistorySummary({
        type: "issue.label_added",
        actorDisplayName: "Rob",
        data: { labelName: "Copy" },
      }),
    ).toBe("Rob added the label “Copy”.");
    expect(
      formatIssueHistorySummary({
        type: "issue.label_removed",
        actorDisplayName: "Rob",
        data: { labelName: "Copy" },
      }),
    ).toBe("Rob removed the label “Copy”.");
    expect(
      formatIssueHistorySummary({
        type: "issue.label_added",
        actorDisplayName: null,
        data: {},
      }),
    ).toBe("Someone added a label.");
  });
});
