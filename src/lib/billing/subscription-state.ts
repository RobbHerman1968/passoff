import { PLAN_ENTITLEMENTS, PLAN_IDS, type PlanId } from "@/lib/billing/plans";

/**
 * How a stored subscription turns into the plan a workspace actually gets.
 *
 * Pure functions only: no database, no Stripe. The webhook handler keeps the stored row
 * in step with Stripe, and everything that enforces a limit asks this file what the row
 * means right now. Work is never deleted for non-payment; the worst outcome is Free limits.
 */

/** Days a workspace keeps its paid plan after the first failed payment. */
export const PAST_DUE_GRACE_DAYS = 7;

/**
 * Stripe moves a trial or a cancelled plan on a schedule, and the notice reaches us a moment
 * later. This slack keeps a workspace on its plan while that notice is on its way.
 */
export const PROVIDER_SETTLE_MS = 24 * 60 * 60 * 1000;

const DAY_MS = 24 * 60 * 60 * 1000;

export type StoredSubscriptionStatus = "trialing" | "active" | "past_due" | "cancelled";

export type SubscriptionSnapshot = {
  plan: string;
  status: StoredSubscriptionStatus;
  billingInterval: string | null;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
  trialStartedAt: Date | null;
  trialEndsAt: Date | null;
  pastDueSince: Date | null;
};

export type BillingState =
  /** Never subscribed, or a plan that is simply Free. */
  | "free"
  | "trialing"
  | "active"
  /** Paid, and set to stop at the end of the current period. */
  | "cancelling"
  /** A payment failed. The paid plan is kept during the grace period. */
  | "past_due"
  /** The grace period ended without payment. Free limits apply; nothing was deleted. */
  | "payment_lapsed"
  /** The trial ended without a paid plan. */
  | "trial_ended"
  /** The paid plan ended. */
  | "cancelled";

export type EntitlementResolution = {
  /** The plan whose limits apply right now. */
  planId: PlanId;
  /** The plan the subscription is for, even when its limits no longer apply. */
  purchasedPlanId: PlanId | null;
  state: BillingState;
  trialEndsAt: Date | null;
  graceEndsAt: Date | null;
  billingInterval: "month" | "year" | null;
  currentPeriodEnd: Date | null;
};

function asPlanId(value: string): PlanId | null {
  return (PLAN_IDS as readonly string[]).includes(value) ? (value as PlanId) : null;
}

function asInterval(value: string | null): "month" | "year" | null {
  return value === "month" || value === "year" ? value : null;
}

export function graceEndsAt(pastDueSince: Date): Date {
  return new Date(pastDueSince.getTime() + PAST_DUE_GRACE_DAYS * DAY_MS);
}

const FREE: EntitlementResolution = {
  planId: "free",
  purchasedPlanId: null,
  state: "free",
  trialEndsAt: null,
  graceEndsAt: null,
  billingInterval: null,
  currentPeriodEnd: null,
};

export function resolveEntitlement(
  subscription: SubscriptionSnapshot | null,
  now: Date = new Date(),
): EntitlementResolution {
  if (!subscription) return FREE;
  const purchased = asPlanId(subscription.plan);
  if (!purchased || purchased === "free") return FREE;

  const base = {
    purchasedPlanId: purchased,
    trialEndsAt: subscription.trialEndsAt,
    graceEndsAt: null as Date | null,
    billingInterval: asInterval(subscription.billingInterval),
    currentPeriodEnd: subscription.currentPeriodEnd,
  };
  const nowMs = now.getTime();

  switch (subscription.status) {
    case "cancelled":
      return { ...base, planId: "free", state: "cancelled" };

    case "trialing": {
      const ends = subscription.trialEndsAt;
      if (ends && nowMs > ends.getTime() + PROVIDER_SETTLE_MS) {
        return { ...base, planId: "free", state: "trial_ended" };
      }
      return { ...base, planId: purchased, state: "trialing" };
    }

    case "past_due": {
      // If the first failure time is missing, keep the plan rather than punish the workspace.
      const since = subscription.pastDueSince;
      if (!since) return { ...base, planId: purchased, state: "past_due" };
      const graceEnd = graceEndsAt(since);
      if (nowMs >= graceEnd.getTime()) {
        return { ...base, planId: "free", state: "payment_lapsed", graceEndsAt: graceEnd };
      }
      return { ...base, planId: purchased, state: "past_due", graceEndsAt: graceEnd };
    }

    case "active": {
      if (subscription.cancelAtPeriodEnd) {
        const end = subscription.currentPeriodEnd;
        if (end && nowMs > end.getTime() + PROVIDER_SETTLE_MS) {
          return { ...base, planId: "free", state: "cancelled" };
        }
        return { ...base, planId: purchased, state: "cancelling" };
      }
      return { ...base, planId: purchased, state: "active" };
    }
  }
}

/** Plain-language one-line status for the billing page and notices. */
export function describeBillingState(state: BillingState): string {
  switch (state) {
    case "free":
      return "Free plan";
    case "trialing":
      return "Free trial";
    case "active":
      return "Active";
    case "cancelling":
      return "Ends at the end of this period";
    case "past_due":
      return "Payment needs attention";
    case "payment_lapsed":
      return "Payment overdue";
    case "trial_ended":
      return "Trial ended";
    case "cancelled":
      return "Plan ended";
  }
}

/**
 * Stripe's statuses mapped onto ours. `null` means "do not change what we store":
 * an incomplete first payment has not given anyone a plan yet, and an expired one never will.
 */
export function mapStripeSubscriptionStatus(status: string): StoredSubscriptionStatus | null {
  switch (status) {
    case "trialing":
      return "trialing";
    case "active":
      return "active";
    case "past_due":
    case "unpaid":
      return "past_due";
    case "canceled":
    case "paused":
      return "cancelled";
    case "incomplete":
    case "incomplete_expired":
    default:
      return null;
  }
}

/**
 * A workspace gets one trial, ever. Having started one, or having ever held a paid
 * subscription, means the offer is spent. The record is kept even after cancelling.
 */
export function isTrialEligible(
  subscription: {
    trialStartedAt: Date | null;
    providerSubscriptionId: string | null;
  } | null,
): boolean {
  if (!subscription) return true;
  return !subscription.trialStartedAt && !subscription.providerSubscriptionId;
}

/** Whole days left, counting any part of a day as a day. Never negative. */
export function daysLeft(until: Date | null, now: Date = new Date()): number | null {
  if (!until) return null;
  const remaining = until.getTime() - now.getTime();
  return remaining <= 0 ? 0 : Math.ceil(remaining / DAY_MS);
}

/** True when the stored row buys more than Free right now. */
export function isPaidState(state: BillingState): boolean {
  return state === "trialing" || state === "active" || state === "cancelling" || state === "past_due";
}

/** The plan to suggest when a limit is reached. */
export function nextPlanUp(planId: PlanId): PlanId | null {
  if (planId === "free") return "studio";
  if (planId === "studio") return "agency";
  return null;
}

export function planName(planId: PlanId): string {
  return PLAN_ENTITLEMENTS[planId].name;
}
