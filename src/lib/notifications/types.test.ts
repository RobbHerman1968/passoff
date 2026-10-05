import { describe, expect, it } from "vitest";

import {
  formatUnreadCount,
  notificationCopy,
  notificationsBellLabel,
} from "@/lib/notifications/types";

describe("notification copy", () => {
  const data = {
    workspaceName: "Studio",
    projectName: "Launch",
    reviewName: "Homepage review",
    actorName: "Jamie",
    issueNumber: 24,
    versionLabel: "October 4",
  };

  it("uses plain-language titles and actions", () => {
    expect(notificationCopy("issue.assigned", data, "/issues/24").title).toBe(
      "Issue #24 was assigned to you.",
    );
    expect(notificationCopy("issue.comment_replied", data, "/x").title).toBe(
      "Jamie replied to your feedback.",
    );
    expect(notificationCopy("issue.ready_for_verification", data, "/x").action.label).toBe(
      "Verify fix",
    );
    expect(notificationCopy("issue.verification_failed", data, "/x").title).toBe(
      "The latest fix did not pass verification.",
    );
    expect(notificationCopy("review.ready_for_approval", data, "/x").title).toBe(
      "Homepage review is ready for approval.",
    );
    expect(notificationCopy("review.changes_requested", data, "/x").title).toBe(
      "Jamie requested changes to the October 4 deployment.",
    );
  });

  it("formats unread counts for the bell", () => {
    expect(formatUnreadCount(0)).toBe("");
    expect(formatUnreadCount(3)).toBe("3");
    expect(formatUnreadCount(100)).toBe("99+");
    expect(notificationsBellLabel(0)).toBe("Notifications");
    expect(notificationsBellLabel(1)).toBe("Notifications, 1 unread");
    expect(notificationsBellLabel(120)).toBe("Notifications, 99+ unread");
  });
});
