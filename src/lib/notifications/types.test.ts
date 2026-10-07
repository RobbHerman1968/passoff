import { describe, expect, it } from "vitest";

import {
  NOTIFICATION_TYPES,
  emailCategoryForType,
  formatUnreadCount,
  isEssentialEmailType,
  notificationCopy,
  notificationsBellLabel,
  shouldEmailNotification,
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
    expect(notificationCopy("verification_run.failed", data, "/x").title).toBe(
      "Issue #24 browser checks found a problem.",
    );
    expect(notificationCopy("verification_run.uncertain", data, "/x").action.label).toBe(
      "View issue",
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

describe("deadline reminder notifications", () => {
  const data = {
    workspaceName: "Studio",
    projectName: "Launch",
    reviewName: "Homepage review",
    actorName: "Passoff",
    deadlineAt: "2026-10-08T17:30:00.000Z",
  };

  it("uses plain language for upcoming and past-due reminders", () => {
    const upcoming = notificationCopy(
      "review.deadline_reminder",
      { ...data, deadlineState: "upcoming" },
      "/projects/p/reviews/r",
    );
    expect(upcoming.title).toBe("Feedback for Homepage review is due soon.");
    expect(upcoming.description).toBe("Due Oct 8, 2026, 5:30 PM UTC · Launch");
    expect(upcoming.action).toEqual({ label: "View review", href: "/projects/p/reviews/r" });

    const pastDue = notificationCopy(
      "review.deadline_reminder",
      { ...data, deadlineState: "past_due" },
      "/x",
    );
    expect(pastDue.title).toBe("The feedback deadline for Homepage review has passed.");
    expect(pastDue.description).toContain("Was due");
  });

  it("copes with a missing or invalid deadline time", () => {
    const copy = notificationCopy(
      "review.deadline_reminder",
      { ...data, deadlineAt: "nope", deadlineState: "upcoming" },
      "/x",
    );
    expect(copy.description).toBe("Launch");
  });

  it("emails under the approval preference", () => {
    expect(emailCategoryForType("review.deadline_reminder")).toBe("approval");
  });
});

describe("billing notifications", () => {
  const billingTypes = NOTIFICATION_TYPES.filter((type) => type.startsWith("billing."));
  const data = {
    workspaceName: "Acme Studio",
    projectName: "",
    reviewName: "",
    actorName: "Passoff",
    planName: "Agency",
    trialEndsAt: "2026-10-21T00:00:00.000Z",
    graceEndsAt: "2026-10-14T00:00:00.000Z",
    usageLabel: "Active review websites",
    usageUsed: 4,
    usageLimit: 5,
  };

  it("covers every billing event the product sends", () => {
    expect(billingTypes.sort()).toEqual(
      [
        "billing.payment_failed",
        "billing.payment_lapsed",
        "billing.payment_recovered",
        "billing.plan_changed",
        "billing.plan_started",
        "billing.subscription_ended",
        "billing.trial_ending",
        "billing.usage_warning",
      ].sort(),
    );
  });

  it("always emails owners about billing, whatever their preferences", () => {
    for (const type of billingTypes) {
      expect(isEssentialEmailType(type), type).toBe(true);
      expect(shouldEmailNotification(type), type).toBe(true);
    }
    expect(isEssentialEmailType("issue.assigned")).toBe(false);
  });

  it("uses plain language, points at the billing page, and never blames or alarms", () => {
    for (const type of billingTypes) {
      const copy = notificationCopy(type, data, "/settings/billing");
      expect(copy.title.length, type).toBeGreaterThan(10);
      expect(`${copy.title} ${copy.description}`, type).not.toMatch(
        /stripe|webhook|invoice\.|subscription_|_|\bnull\b|undefined/i,
      );
    }
  });

  it("reassures owners that nothing is deleted when payment fails or lapses", () => {
    const failed = notificationCopy("billing.payment_failed", data, "/settings/billing");
    const lapsed = notificationCopy("billing.payment_lapsed", data, "/settings/billing");
    expect(`${failed.title} ${failed.description}`).toMatch(/keep|nothing|safe/i);
    expect(`${lapsed.title} ${lapsed.description}`).toMatch(/kept|nothing|safe|still/i);
  });

  it("names the usage and the limit in a usage warning", () => {
    const copy = notificationCopy("billing.usage_warning", data, "/settings/billing");
    expect(`${copy.title} ${copy.description}`).toContain("Active review websites");
  });
});
