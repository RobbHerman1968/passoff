import "server-only";

import { and, eq } from "drizzle-orm";
import type Stripe from "stripe";

import { db } from "@/db";
import { providerEvents, subscriptions, workspaces } from "@/db/schema";
import { getBillingGateway, type BillingGateway } from "@/lib/billing/gateway";
import { notifyWorkspaceOwners } from "@/lib/billing/notify";
import { PLAN_ENTITLEMENTS } from "@/lib/billing/plans";
import {
  planForPriceId,
  readBillingEnvironment,
  type StripePrices,
} from "@/lib/billing/stripe-config";
import {
  graceEndsAt,
  mapStripeSubscriptionStatus,
  resolveEntitlement,
  type StoredSubscriptionStatus,
} from "@/lib/billing/subscription-state";
import { loadSubscription, type StoredSubscription } from "@/lib/billing/effective-plan";
import { WORKSPACE_ACTIVITY_TYPES, recordWorkspaceActivity } from "@/lib/workspaces/audit";
import { notifyUsageThresholds } from "@/lib/billing/usage-notices";
import { logOps, safeErrorSummary } from "@/lib/ops/diagnostics";

export const STRIPE_PROVIDER = "stripe";

export type StripeWebhookOutcome =
  /** The event changed (or confirmed) stored billing state. */
  | { status: "processed" }
  /** Stripe sent this exact event before. Nothing was done twice. */
  | { status: "duplicate" }
  /** A valid event Passoff has no use for, or one that belongs to nobody here. */
  | { status: "ignored"; reason: string };

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Work to do only after the database change has been committed. */
type AfterCommit =
  | {
      kind: "notify";
      workspaceId: string;
      type: Parameters<typeof notifyWorkspaceOwners>[0]["type"];
      dedupeKey: string;
      data?: Parameters<typeof notifyWorkspaceOwners>[0]["data"];
    }
  | { kind: "cancel_duplicate"; subscriptionId: string }
  | { kind: "usage_check"; workspaceId: string };

type Handled = { workspaceId?: string; ignored?: string; effects?: AfterCommit[] };

const fromSeconds = (seconds: number | null | undefined): Date | null =>
  typeof seconds === "number" ? new Date(seconds * 1000) : null;

const customerIdOf = (customer: string | { id: string } | null | undefined): string | null =>
  typeof customer === "string" ? customer : (customer?.id ?? null);

/** Lock the subscription row for this Stripe customer so events for one workspace run one at a time. */
async function lockByCustomer(tx: Transaction, customerId: string) {
  const [row] = await tx
    .select({ id: subscriptions.id, workspaceId: subscriptions.workspaceId })
    .from(subscriptions)
    .where(
      and(
        eq(subscriptions.provider, STRIPE_PROVIDER),
        eq(subscriptions.providerCustomerId, customerId),
      ),
    )
    .limit(1)
    .for("update");
  if (!row) return null;
  // Re-read through the shared loader so the snapshot has every field the rules need.
  return loadSubscription(tx, row.workspaceId);
}

function invoiceSubscriptionId(invoice: Stripe.Invoice): string | null {
  const details = invoice.parent?.subscription_details;
  const subscription = details?.subscription;
  return typeof subscription === "string" ? subscription : (subscription?.id ?? null);
}

function isStale(row: StoredSubscription, eventAt: Date): boolean {
  return Boolean(row.providerEventAt && eventAt.getTime() < row.providerEventAt.getTime());
}

function isLive(row: StoredSubscription): boolean {
  return Boolean(row.providerSubscriptionId) && row.status !== "cancelled";
}

async function handleSubscription(
  tx: Transaction,
  subscription: Stripe.Subscription,
  eventAt: Date,
  prices: StripePrices | null,
  eventId: string,
  deleted: boolean,
): Promise<Handled> {
  const customerId = customerIdOf(subscription.customer);
  if (!customerId) return { ignored: "no customer" };
  const row = await lockByCustomer(tx, customerId);
  if (!row) return { ignored: "unknown customer" };

  const workspaceId = row.workspaceId;
  const status: StoredSubscriptionStatus | null = deleted
    ? "cancelled"
    : mapStripeSubscriptionStatus(subscription.status);
  if (!status) return { workspaceId, ignored: `status ${subscription.status} gives no plan` };
  if (isStale(row, eventAt)) return { workspaceId, ignored: "older than stored state" };

  const item = subscription.items.data[0];
  const mapped = planForPriceId(prices, item?.price?.id);
  if (!mapped) {
    // A price Passoff does not know must never grant a plan. Someone needs to fix the price mapping.
    logOps("error", "billing.unknown_price", { workspaceId });
    return { workspaceId, ignored: "unknown price" };
  }

  const effects: AfterCommit[] = [];
  const incomingLive = status !== "cancelled";
  const differentSubscription =
    Boolean(row.providerSubscriptionId) && row.providerSubscriptionId !== subscription.id;

  if (differentSubscription) {
    if (isLive(row)) {
      // The workspace already pays for a subscription. A second live one would charge twice.
      if (incomingLive) effects.push({ kind: "cancel_duplicate", subscriptionId: subscription.id });
      return { workspaceId, ignored: "workspace already has a subscription", effects };
    }
    // The stored subscription ended, so a new one may take its place; an older cancelled one may not.
    if (!incomingLive) return { workspaceId, ignored: "older subscription ended" };
  }

  // One trial per workspace, ever. A second trial is stopped rather than honoured.
  const startsTrial = Boolean(subscription.trial_start);
  if (startsTrial && row.trialStartedAt && (differentSubscription || !row.providerSubscriptionId) && incomingLive) {
    effects.push({ kind: "cancel_duplicate", subscriptionId: subscription.id });
    return { workspaceId, ignored: "trial already used", effects };
  }

  const before = resolveEntitlement(row, eventAt);
  const periodStart = fromSeconds(item.current_period_start);
  const periodEnd = fromSeconds(item.current_period_end);
  const trialEnd = fromSeconds(subscription.trial_end);
  const cancelsAtPeriodEnd = Boolean(subscription.cancel_at_period_end || subscription.cancel_at);
  const pastDueSince =
    status === "past_due"
      ? row.status === "past_due" && !differentSubscription
        ? (row.pastDueSince ?? eventAt)
        : eventAt
      : null;
  const cancelledAt =
    status === "cancelled"
      ? (fromSeconds(subscription.ended_at) ?? fromSeconds(subscription.canceled_at) ?? eventAt)
      : null;

  const next = {
    plan: mapped.plan as string,
    status,
    providerSubscriptionId: subscription.id,
    providerPriceId: item.price.id,
    billingInterval: mapped.interval as string,
    currentPeriodStart: periodStart,
    currentPeriodEnd: periodEnd,
    cancelAtPeriodEnd: cancelsAtPeriodEnd,
    trialStartedAt: row.trialStartedAt ?? fromSeconds(subscription.trial_start),
    trialEndsAt: trialEnd,
    pastDueSince,
    cancelledAt,
    providerEventAt: eventAt,
    updatedAt: new Date(),
  };

  await tx.update(subscriptions).set(next).where(eq(subscriptions.id, row.id));

  const after = resolveEntitlement({ ...row, ...next, status }, eventAt);

  if (after.planId !== before.planId) {
    await recordWorkspaceActivity(tx, {
      workspaceId,
      actorUserId: null,
      type: WORKSPACE_ACTIVITY_TYPES.BILLING_PLAN_CHANGED,
      data: { from: before.planId, to: after.planId, state: after.state },
    });
  }

  if (after.planId !== "free" && after.planId !== before.planId) {
    effects.push({
      kind: "notify",
      workspaceId,
      type: before.planId === "free" ? "billing.plan_started" : "billing.plan_changed",
      dedupeKey: `billing.plan:${eventId}`,
      data: { planName: PLAN_ENTITLEMENTS[after.planId].name },
    });
  }

  if (before.planId !== "free" && after.planId === "free") {
    await recordWorkspaceActivity(tx, {
      workspaceId,
      actorUserId: null,
      type: WORKSPACE_ACTIVITY_TYPES.BILLING_SUBSCRIPTION_ENDED,
      data: { plan: before.planId },
    });
    effects.push({
      kind: "notify",
      workspaceId,
      type: "billing.subscription_ended",
      dedupeKey: `billing.subscription_ended:${eventId}`,
      data: { planName: PLAN_ENTITLEMENTS[before.planId].name },
    });
  }

  // After a plan change the workspace may be near or over a limit; tell the owner once.
  if (after.planId !== before.planId) effects.push({ kind: "usage_check", workspaceId });

  return { workspaceId, effects };
}

async function handleInvoicePaymentFailed(
  tx: Transaction,
  invoice: Stripe.Invoice,
  eventAt: Date,
): Promise<Handled> {
  const customerId = customerIdOf(invoice.customer);
  if (!customerId) return { ignored: "no customer" };
  const row = await lockByCustomer(tx, customerId);
  if (!row) return { ignored: "unknown customer" };
  const workspaceId = row.workspaceId;

  const subscriptionId = invoiceSubscriptionId(invoice);
  // A failed first payment has no plan to protect yet; only a subscription we already track matters.
  if (!subscriptionId || subscriptionId !== row.providerSubscriptionId || row.status === "cancelled") {
    return { workspaceId, ignored: "not about the stored subscription" };
  }
  if (isStale(row, eventAt)) return { workspaceId, ignored: "older than stored state" };

  const pastDueSince = row.status === "past_due" ? (row.pastDueSince ?? eventAt) : eventAt;
  await tx
    .update(subscriptions)
    .set({ status: "past_due", pastDueSince, providerEventAt: eventAt, updatedAt: new Date() })
    .where(eq(subscriptions.id, row.id));
  await recordWorkspaceActivity(tx, {
    workspaceId,
    actorUserId: null,
    type: WORKSPACE_ACTIVITY_TYPES.BILLING_PAYMENT_FAILED,
    data: { plan: row.plan },
  });

  const planLabel = PLAN_ENTITLEMENTS[resolveEntitlement(row, eventAt).purchasedPlanId ?? "free"].name;
  return {
    workspaceId,
    effects: [
      {
        kind: "notify",
        workspaceId,
        type: "billing.payment_failed",
        // One notice per run of failures, not one per retry.
        dedupeKey: `billing.payment_failed:${workspaceId}:${pastDueSince.toISOString()}`,
        data: { planName: planLabel, graceEndsAt: graceEndsAt(pastDueSince).toISOString() },
      },
    ],
  };
}

async function handleInvoicePaid(
  tx: Transaction,
  invoice: Stripe.Invoice,
  eventAt: Date,
  eventId: string,
): Promise<Handled> {
  const customerId = customerIdOf(invoice.customer);
  if (!customerId) return { ignored: "no customer" };
  const row = await lockByCustomer(tx, customerId);
  if (!row) return { ignored: "unknown customer" };
  const workspaceId = row.workspaceId;

  const subscriptionId = invoiceSubscriptionId(invoice);
  if (!subscriptionId || subscriptionId !== row.providerSubscriptionId) {
    return { workspaceId, ignored: "not about the stored subscription" };
  }
  if (isStale(row, eventAt)) return { workspaceId, ignored: "older than stored state" };
  if (row.status !== "past_due") {
    // Ordinary renewals change nothing here; the subscription event keeps dates current.
    return { workspaceId, ignored: "nothing was overdue" };
  }

  await tx
    .update(subscriptions)
    .set({ status: "active", pastDueSince: null, providerEventAt: eventAt, updatedAt: new Date() })
    .where(eq(subscriptions.id, row.id));
  await recordWorkspaceActivity(tx, {
    workspaceId,
    actorUserId: null,
    type: WORKSPACE_ACTIVITY_TYPES.BILLING_PAYMENT_RECOVERED,
    data: { plan: row.plan },
  });
  return {
    workspaceId,
    effects: [
      {
        kind: "notify",
        workspaceId,
        type: "billing.payment_recovered",
        dedupeKey: `billing.payment_recovered:${eventId}`,
        data: { planName: PLAN_ENTITLEMENTS[resolveEntitlement(row, eventAt).purchasedPlanId ?? "free"].name },
      },
    ],
  };
}

async function handleCheckoutCompleted(
  tx: Transaction,
  session: Stripe.Checkout.Session,
): Promise<Handled> {
  // Checkout finishing is not proof of a plan. Entitlements come from the subscription
  // events. This only confirms the session belongs to a workspace we know and keeps a record.
  if (session.mode !== "subscription") return { ignored: "not a subscription checkout" };
  const customerId = customerIdOf(session.customer);
  if (!customerId) return { ignored: "no customer" };
  const row = await lockByCustomer(tx, customerId);
  if (!row) return { ignored: "unknown customer" };
  if (session.client_reference_id && session.client_reference_id !== row.workspaceId) {
    return { workspaceId: row.workspaceId, ignored: "checkout belongs to a different workspace" };
  }
  await recordWorkspaceActivity(tx, {
    workspaceId: row.workspaceId,
    actorUserId: null,
    type: WORKSPACE_ACTIVITY_TYPES.BILLING_CHECKOUT_COMPLETED,
    data: {},
  });
  return { workspaceId: row.workspaceId };
}

async function handleTrialWillEnd(
  tx: Transaction,
  subscription: Stripe.Subscription,
): Promise<Handled> {
  const customerId = customerIdOf(subscription.customer);
  if (!customerId) return { ignored: "no customer" };
  const row = await lockByCustomer(tx, customerId);
  if (!row) return { ignored: "unknown customer" };
  if (row.providerSubscriptionId !== subscription.id || row.status !== "trialing") {
    return { workspaceId: row.workspaceId, ignored: "not trialing" };
  }
  const trialEnd = fromSeconds(subscription.trial_end) ?? row.trialEndsAt;
  return {
    workspaceId: row.workspaceId,
    effects: [
      {
        kind: "notify",
        workspaceId: row.workspaceId,
        type: "billing.trial_ending",
        dedupeKey: `billing.trial_ending:${row.workspaceId}:${subscription.id}`,
        data: { planName: PLAN_ENTITLEMENTS.agency.name, trialEndsAt: trialEnd?.toISOString() },
      },
    ],
  };
}

async function runAfterCommit(effects: AfterCommit[], gateway: BillingGateway | null) {
  for (const effect of effects) {
    try {
      if (effect.kind === "notify") {
        await notifyWorkspaceOwners({
          workspaceId: effect.workspaceId,
          type: effect.type,
          dedupeKey: effect.dedupeKey,
          data: effect.data,
        });
      } else if (effect.kind === "cancel_duplicate") {
        await gateway?.cancelSubscription(effect.subscriptionId);
      } else {
        await notifyUsageThresholds(effect.workspaceId);
      }
    } catch (error) {
      // The stored state is already correct. A lost notice must not make Stripe resend the event.
      logOps("error", "billing.follow_up_failed", {
        kind: effect.kind,
        ...safeErrorSummary(error),
      });
    }
  }
}

/**
 * Applies one verified Stripe event. Safe to run twice and safe to run out of order.
 *
 * The event receipt and the state change commit together, so a crash halfway leaves no
 * receipt and Stripe's retry does the whole job again. A repeated event finds its receipt
 * and does nothing. An event older than what is already stored never overwrites it.
 */
export async function processStripeEvent(
  event: Stripe.Event,
  options: { gateway?: BillingGateway | null; prices?: StripePrices | null } = {},
): Promise<StripeWebhookOutcome> {
  const prices = options.prices === undefined ? readBillingEnvironment().prices : options.prices;
  const eventAt = new Date(event.created * 1000);

  const result = await db.transaction(async (tx): Promise<Handled | "duplicate"> => {
    const claimed = await tx
      .insert(providerEvents)
      .values({
        provider: STRIPE_PROVIDER,
        providerEventId: event.id,
        eventType: event.type,
        eventCreatedAt: eventAt,
      })
      .onConflictDoNothing({ target: [providerEvents.provider, providerEvents.providerEventId] })
      .returning({ id: providerEvents.id });
    if (claimed.length === 0) return "duplicate";

    let handled: Handled;
    switch (event.type) {
      case "customer.subscription.created":
      case "customer.subscription.updated":
        handled = await handleSubscription(tx, event.data.object, eventAt, prices, event.id, false);
        break;
      case "customer.subscription.deleted":
        handled = await handleSubscription(tx, event.data.object, eventAt, prices, event.id, true);
        break;
      case "customer.subscription.trial_will_end":
        handled = await handleTrialWillEnd(tx, event.data.object);
        break;
      case "invoice.payment_failed":
        handled = await handleInvoicePaymentFailed(tx, event.data.object, eventAt);
        break;
      case "invoice.paid":
        handled = await handleInvoicePaid(tx, event.data.object, eventAt, event.id);
        break;
      case "checkout.session.completed":
        handled = await handleCheckoutCompleted(tx, event.data.object);
        break;
      default:
        handled = { ignored: "event type not used" };
    }

    if (handled.workspaceId) {
      const [workspace] = await tx
        .select({ id: workspaces.id })
        .from(workspaces)
        .where(eq(workspaces.id, handled.workspaceId))
        .limit(1);
      if (workspace) {
        await tx
          .update(providerEvents)
          .set({ workspaceId: workspace.id })
          .where(
            and(
              eq(providerEvents.provider, STRIPE_PROVIDER),
              eq(providerEvents.providerEventId, event.id),
            ),
          );
      }
    }
    return handled;
  });

  if (result === "duplicate") return { status: "duplicate" };
  await runAfterCommit(result.effects ?? [], options.gateway ?? getBillingGateway());
  return result.ignored ? { status: "ignored", reason: result.ignored } : { status: "processed" };
}

