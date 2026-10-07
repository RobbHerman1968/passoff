import "server-only";

import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import { subscriptions, workspaces } from "@/db/schema";
import { enforceAuthRateLimit, formatRetryGuidance } from "@/lib/auth/rate-limit";
import { getBillingGateway, isBillingConfigured } from "@/lib/billing/gateway";
import {
  loadSubscription,
  type StoredSubscription,
} from "@/lib/billing/effective-plan";
import { AGENCY_TRIAL_DAYS, PLAN_ENTITLEMENTS } from "@/lib/billing/plans";
import {
  getReviewWebsiteCapacity,
  type ReviewWebsiteCapacity,
} from "@/lib/billing/review-websites";
import {
  isBillingInterval,
  isPaidPlanId,
  type BillingInterval,
  type PaidPlanId,
} from "@/lib/billing/stripe-config";
import {
  daysLeft,
  describeBillingState,
  isTrialEligible,
  resolveEntitlement,
  type BillingState,
  type EntitlementResolution,
} from "@/lib/billing/subscription-state";
import { absoluteUrl } from "@/lib/site";
import { getMemberCapacity, type MemberCapacity } from "@/lib/workspaces/capacity";
import type { WorkspaceContext } from "@/lib/workspaces/context";
import { loadCallerRole, lockWorkspace } from "@/lib/workspaces/members";
import { can } from "@/lib/workspaces/permissions";
import { getVideoUsageView } from "@/lib/video/usage";
import type { VideoUsageView } from "@/lib/video/states";

/** The provider name stored on subscriptions Passoff created through Stripe. */
export const BILLING_PROVIDER_NAME = "stripe";

export const BILLING_MESSAGES = {
  forbidden: "Only the workspace owner can change billing.",
  notConfigured:
    "Plan changes aren’t available right now. Nothing was charged. Please try again later.",
  unavailable:
    "We couldn’t reach our payment provider. Nothing was charged. Try again in a moment.",
  invalid: "Choose a plan and billing schedule, then try again.",
  alreadySubscribed:
    "This workspace already has a plan. Use “Manage billing” to change it or update payment details.",
  noCustomer: "There’s nothing to manage yet. Choose a plan first.",
  notYourWorkspace: "We couldn’t find this workspace.",
} as const;

export type BillingSessionResult =
  | { ok: true; url: string }
  | {
      ok: false;
      error:
        | "forbidden"
        | "invalid"
        | "not_configured"
        | "already_subscribed"
        | "no_customer"
        | "rate_limited"
        | "unavailable";
      message: string;
    };

type OwnerCheck =
  | { ok: true; workspaceName: string }
  | { ok: false; result: Extract<BillingSessionResult, { ok: false }> };

/** Billing is owner-only. The role is re-read from the database, never taken from the request. */
async function requireOwner(context: WorkspaceContext): Promise<OwnerCheck> {
  const forbidden: OwnerCheck = {
    ok: false,
    result: { ok: false, error: "forbidden", message: BILLING_MESSAGES.forbidden },
  };
  if (!can(context, "billing.manage")) return forbidden;
  return db.transaction(async (tx) => {
    const workspace = await lockWorkspace(tx, context.workspaceId);
    const role = await loadCallerRole(tx, context);
    if (!workspace || !can({ role }, "billing.manage")) return forbidden;
    return { ok: true as const, workspaceName: workspace.name };
  });
}

function hasLiveProviderSubscription(subscription: StoredSubscription | null): boolean {
  return Boolean(subscription?.providerSubscriptionId && subscription.status !== "cancelled");
}

async function throttle(workspaceId: string): Promise<BillingSessionResult | null> {
  const limited = await enforceAuthRateLimit({
    scope: "billing_session",
    subjects: [workspaceId],
  });
  if (limited.ok) return null;
  return {
    ok: false,
    error: "rate_limited",
    message: `You’ve tried that a few times. ${formatRetryGuidance(limited.retryAfterSeconds)}`,
  };
}

/**
 * Returns the address of a Stripe-hosted Checkout page. Nothing changes in Passoff until
 * Stripe's webhook says the plan is paid for: coming back from Checkout proves nothing.
 */
export async function startCheckout(
  context: WorkspaceContext,
  input: { plan: unknown; interval: unknown },
): Promise<BillingSessionResult> {
  if (!isPaidPlanId(input.plan) || !isBillingInterval(input.interval)) {
    return { ok: false, error: "invalid", message: BILLING_MESSAGES.invalid };
  }
  const plan: PaidPlanId = input.plan;
  const interval: BillingInterval = input.interval;

  const owner = await requireOwner(context);
  if (!owner.ok) return owner.result;

  const gateway = getBillingGateway();
  if (!gateway) {
    return { ok: false, error: "not_configured", message: BILLING_MESSAGES.notConfigured };
  }

  const limited = await throttle(context.workspaceId);
  if (limited) return limited;

  try {
    let subscription = await loadSubscription(db, context.workspaceId);
    if (hasLiveProviderSubscription(subscription)) {
      // A second subscription would bill the workspace twice. Changes go through the portal.
      return { ok: false, error: "already_subscribed", message: BILLING_MESSAGES.alreadySubscribed };
    }
    if (subscription && subscription.provider !== BILLING_PROVIDER_NAME) {
      return { ok: false, error: "unavailable", message: BILLING_MESSAGES.unavailable };
    }

    let customerId = subscription?.providerCustomerId ?? null;
    if (!customerId) {
      const created = await gateway.createCustomer({
        workspaceId: context.workspaceId,
        workspaceName: owner.workspaceName,
        ownerEmail: context.userEmail,
      });
      // The free placeholder remembers the Stripe customer so every later event can be
      // matched to this workspace. If two requests race, the first one wins.
      await db
        .insert(subscriptions)
        .values({
          workspaceId: context.workspaceId,
          provider: BILLING_PROVIDER_NAME,
          providerCustomerId: created.customerId,
          plan: "free",
          status: "active",
        })
        .onConflictDoNothing({ target: subscriptions.workspaceId });
      subscription = await loadSubscription(db, context.workspaceId);
      customerId = subscription?.providerCustomerId ?? created.customerId;
    }

    const trialDays =
      plan === "agency" && isTrialEligible(subscription) ? AGENCY_TRIAL_DAYS : null;

    const session = await gateway.createCheckoutSession({
      customerId,
      workspaceId: context.workspaceId,
      plan,
      interval,
      trialDays,
      successUrl: absoluteUrl("/settings/billing?checkout=success"),
      cancelUrl: absoluteUrl("/settings/billing?checkout=cancelled"),
    });
    return { ok: true, url: session.url };
  } catch {
    return { ok: false, error: "unavailable", message: BILLING_MESSAGES.unavailable };
  }
}

/** Returns the address of the Stripe-hosted Billing Portal. */
export async function openBillingPortal(
  context: WorkspaceContext,
): Promise<BillingSessionResult> {
  const owner = await requireOwner(context);
  if (!owner.ok) return owner.result;

  const gateway = getBillingGateway();
  if (!gateway) {
    return { ok: false, error: "not_configured", message: BILLING_MESSAGES.notConfigured };
  }

  const limited = await throttle(context.workspaceId);
  if (limited) return limited;

  try {
    const subscription = await loadSubscription(db, context.workspaceId);
    if (!subscription || subscription.provider !== BILLING_PROVIDER_NAME) {
      return { ok: false, error: "no_customer", message: BILLING_MESSAGES.noCustomer };
    }
    const session = await gateway.createPortalSession({
      customerId: subscription.providerCustomerId,
      returnUrl: absoluteUrl("/settings/billing"),
    });
    return { ok: true, url: session.url };
  } catch {
    return { ok: false, error: "unavailable", message: BILLING_MESSAGES.unavailable };
  }
}

export type BillingOverview = {
  workspaceName: string;
  canManage: boolean;
  /** Whether this server can start Checkout. When false, buttons explain instead of failing. */
  billingConfigured: boolean;
  resolution: EntitlementResolution;
  planName: string;
  state: BillingState;
  stateLabel: string;
  /** A Stripe customer exists, so the Billing Portal can open. */
  canOpenPortal: boolean;
  /** A subscription is live at Stripe: plan changes go through the portal, not a new Checkout. */
  hasSubscription: boolean;
  cancelAtPeriodEnd: boolean;
  trial: {
    eligible: boolean;
    days: number;
    endsAt: Date | null;
    daysLeft: number | null;
  };
  members: MemberCapacity;
  websites: ReviewWebsiteCapacity;
  video: VideoUsageView | null;
  /** Anything above what the current plan includes. Nothing is removed; only new additions pause. */
  over: { members: boolean; websites: boolean; video: boolean };
};

/** Everyone in the workspace may look; only owners get the buttons. */
export async function getBillingOverview(
  context: WorkspaceContext,
  now: Date = new Date(),
): Promise<BillingOverview | null> {
  if (!can(context, "workspace.plan.view")) return null;

  const [workspace] = await db
    .select({ name: workspaces.name })
    .from(workspaces)
    .where(and(eq(workspaces.id, context.workspaceId)))
    .limit(1);
  if (!workspace) return null;

  const subscription = await loadSubscription(db, context.workspaceId);
  const resolution = resolveEntitlement(subscription, now);
  const [members, websites, video] = await Promise.all([
    getMemberCapacity(context.workspaceId, db, now),
    getReviewWebsiteCapacity(db, context.workspaceId, now),
    getVideoUsageView(db, context.workspaceId),
  ]);

  const retainedOver = video
    ? video.retainedMinutesUsed > video.retainedMinutesAllowed
    : false;

  return {
    workspaceName: workspace.name,
    canManage: can(context, "billing.manage"),
    billingConfigured: isBillingConfigured(),
    resolution,
    planName: PLAN_ENTITLEMENTS[resolution.planId].name,
    state: resolution.state,
    stateLabel: describeBillingState(resolution.state),
    canOpenPortal: subscription?.provider === BILLING_PROVIDER_NAME,
    hasSubscription: hasLiveProviderSubscription(subscription),
    cancelAtPeriodEnd: Boolean(subscription?.cancelAtPeriodEnd),
    trial: {
      eligible: isTrialEligible(subscription),
      days: AGENCY_TRIAL_DAYS,
      endsAt: resolution.trialEndsAt,
      daysLeft: resolution.state === "trialing" ? daysLeft(resolution.trialEndsAt, now) : null,
    },
    members,
    websites,
    video,
    over: { members: members.overCapacity, websites: websites.overLimit, video: retainedOver },
  };
}
