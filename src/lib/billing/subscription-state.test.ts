import { describe, expect, it } from "vitest";

import { PLAN_ENTITLEMENTS } from "@/lib/billing/plans";
import {
  PAST_DUE_GRACE_DAYS,
  PROVIDER_SETTLE_MS,
  daysLeft,
  describeBillingState,
  graceEndsAt,
  isPaidState,
  isTrialEligible,
  mapStripeSubscriptionStatus,
  nextPlanUp,
  resolveEntitlement,
  type SubscriptionSnapshot,
} from "@/lib/billing/subscription-state";

const DAY = 24 * 60 * 60 * 1000;
const now = new Date("2026-10-07T12:00:00Z");

function sub(overrides: Partial<SubscriptionSnapshot> = {}): SubscriptionSnapshot {
  return {
    plan: "studio",
    status: "active",
    billingInterval: "month",
    currentPeriodEnd: new Date(now.getTime() + 20 * DAY),
    cancelAtPeriodEnd: false,
    trialStartedAt: null,
    trialEndsAt: null,
    pastDueSince: null,
    ...overrides,
  };
}

describe("resolveEntitlement", () => {
  it("gives Free to a workspace with no subscription", () => {
    const result = resolveEntitlement(null, now);
    expect(result).toMatchObject({ planId: "free", state: "free", purchasedPlanId: null });
  });

  it("gives the purchased plan while it is active", () => {
    expect(resolveEntitlement(sub(), now)).toMatchObject({
      planId: "studio",
      state: "active",
      billingInterval: "month",
    });
    expect(resolveEntitlement(sub({ plan: "agency", billingInterval: "year" }), now)).toMatchObject({
      planId: "agency",
      billingInterval: "year",
    });
  });

  it("treats an unknown or free plan name as Free instead of guessing", () => {
    expect(resolveEntitlement(sub({ plan: "enterprise" }), now).planId).toBe("free");
    expect(resolveEntitlement(sub({ plan: "free" }), now).planId).toBe("free");
  });

  it("keeps the trial plan until the trial ends, plus a short settling window", () => {
    const trialEndsAt = new Date(now.getTime() + 3 * DAY);
    const trialing = sub({ plan: "agency", status: "trialing", trialEndsAt });
    expect(resolveEntitlement(trialing, now)).toMatchObject({ planId: "agency", state: "trialing" });

    const justAfter = new Date(trialEndsAt.getTime() + PROVIDER_SETTLE_MS - 1000);
    expect(resolveEntitlement(trialing, justAfter).planId).toBe("agency");

    const later = new Date(trialEndsAt.getTime() + PROVIDER_SETTLE_MS + 1000);
    expect(resolveEntitlement(trialing, later)).toMatchObject({
      planId: "free",
      state: "trial_ended",
      purchasedPlanId: "agency",
    });
  });

  it("keeps the paid plan through the grace period after a failed payment, then falls back to Free", () => {
    const pastDueSince = new Date(now.getTime() - 2 * DAY);
    const pastDue = sub({ status: "past_due", pastDueSince });

    const during = resolveEntitlement(pastDue, now);
    expect(during).toMatchObject({ planId: "studio", state: "past_due" });
    expect(during.graceEndsAt?.getTime()).toBe(graceEndsAt(pastDueSince).getTime());

    const edge = new Date(pastDueSince.getTime() + PAST_DUE_GRACE_DAYS * DAY);
    expect(resolveEntitlement(pastDue, new Date(edge.getTime() - 1)).planId).toBe("studio");
    expect(resolveEntitlement(pastDue, edge)).toMatchObject({
      planId: "free",
      state: "payment_lapsed",
      purchasedPlanId: "studio",
    });
  });

  it("does not punish a workspace when the first failure time is missing", () => {
    expect(resolveEntitlement(sub({ status: "past_due", pastDueSince: null }), now)).toMatchObject({
      planId: "studio",
      state: "past_due",
    });
  });

  it("keeps the plan until the end of the period when the owner cancels", () => {
    const cancelling = sub({ cancelAtPeriodEnd: true });
    expect(resolveEntitlement(cancelling, now)).toMatchObject({ planId: "studio", state: "cancelling" });

    const end = cancelling.currentPeriodEnd as Date;
    const after = new Date(end.getTime() + PROVIDER_SETTLE_MS + 1000);
    expect(resolveEntitlement(cancelling, after)).toMatchObject({ planId: "free", state: "cancelled" });
  });

  it("gives Free to a cancelled subscription and remembers what it was", () => {
    expect(resolveEntitlement(sub({ status: "cancelled" }), now)).toMatchObject({
      planId: "free",
      state: "cancelled",
      purchasedPlanId: "studio",
    });
  });
});

describe("mapStripeSubscriptionStatus", () => {
  it.each([
    ["trialing", "trialing"],
    ["active", "active"],
    ["past_due", "past_due"],
    ["unpaid", "past_due"],
    ["canceled", "cancelled"],
    ["paused", "cancelled"],
  ])("maps %s to %s", (input, expected) => {
    expect(mapStripeSubscriptionStatus(input)).toBe(expected);
  });

  it("never grants a plan for an unpaid first attempt or an unknown status", () => {
    expect(mapStripeSubscriptionStatus("incomplete")).toBeNull();
    expect(mapStripeSubscriptionStatus("incomplete_expired")).toBeNull();
    expect(mapStripeSubscriptionStatus("something_new")).toBeNull();
  });
});

describe("isTrialEligible", () => {
  it("allows one trial per workspace, ever", () => {
    expect(isTrialEligible(null)).toBe(true);
    expect(isTrialEligible({ trialStartedAt: null, providerSubscriptionId: null })).toBe(true);
    expect(isTrialEligible({ trialStartedAt: new Date(), providerSubscriptionId: null })).toBe(false);
    expect(isTrialEligible({ trialStartedAt: null, providerSubscriptionId: "sub_1" })).toBe(false);
  });
});

describe("helpers", () => {
  it("counts whole days left and never goes negative", () => {
    expect(daysLeft(null, now)).toBeNull();
    expect(daysLeft(new Date(now.getTime() + 1000), now)).toBe(1);
    expect(daysLeft(new Date(now.getTime() + 3 * DAY), now)).toBe(3);
    expect(daysLeft(new Date(now.getTime() - DAY), now)).toBe(0);
  });

  it("says which states still buy a paid plan", () => {
    expect(isPaidState("trialing")).toBe(true);
    expect(isPaidState("active")).toBe(true);
    expect(isPaidState("cancelling")).toBe(true);
    expect(isPaidState("past_due")).toBe(true);
    expect(isPaidState("payment_lapsed")).toBe(false);
    expect(isPaidState("free")).toBe(false);
  });

  it("suggests the next plan up", () => {
    expect(nextPlanUp("free")).toBe("studio");
    expect(nextPlanUp("studio")).toBe("agency");
    expect(nextPlanUp("agency")).toBeNull();
  });

  it("has plain-language labels with no internal words", () => {
    for (const state of [
      "free",
      "trialing",
      "active",
      "cancelling",
      "past_due",
      "payment_lapsed",
      "trial_ended",
      "cancelled",
    ] as const) {
      const label = describeBillingState(state);
      expect(label).not.toMatch(/_|stripe|webhook|subscription/i);
    }
  });

  it("uses the catalog for the Agency trial length", () => {
    expect(PLAN_ENTITLEMENTS.agency.name).toBe("Agency");
  });
});
