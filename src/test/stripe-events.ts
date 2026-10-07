import { randomUUID } from "node:crypto";

import type Stripe from "stripe";

/**
 * Hand-built Stripe events for tests. They carry only the fields Passoff reads, in the
 * shapes the Stripe API sends. Nothing here talks to Stripe or moves money.
 */

export const TEST_PRICES = {
  studio: { month: "price_test_studio_month", year: "price_test_studio_year" },
  agency: { month: "price_test_agency_month", year: "price_test_agency_year" },
} as const;

export function stripeId(prefix: string) {
  return `${prefix}_${randomUUID().replaceAll("-", "").slice(0, 16)}`;
}

type SubscriptionEventInput = {
  type?:
    | "customer.subscription.created"
    | "customer.subscription.updated"
    | "customer.subscription.deleted"
    | "customer.subscription.trial_will_end";
  eventId?: string;
  customerId: string;
  subscriptionId: string;
  priceId: string;
  status: Stripe.Subscription.Status;
  /** Unix seconds. Defaults to now. */
  created?: number;
  trialStart?: number | null;
  trialEnd?: number | null;
  periodStart?: number;
  periodEnd?: number;
  cancelAtPeriodEnd?: boolean;
  endedAt?: number | null;
};

const nowSeconds = () => Math.floor(Date.now() / 1000);

export function subscriptionEvent(input: SubscriptionEventInput): Stripe.Event {
  const created = input.created ?? nowSeconds();
  return {
    id: input.eventId ?? stripeId("evt"),
    object: "event",
    type: input.type ?? "customer.subscription.updated",
    created,
    data: {
      object: {
        id: input.subscriptionId,
        object: "subscription",
        customer: input.customerId,
        status: input.status,
        cancel_at_period_end: input.cancelAtPeriodEnd ?? false,
        cancel_at: null,
        canceled_at: null,
        ended_at: input.endedAt ?? null,
        trial_start: input.trialStart ?? null,
        trial_end: input.trialEnd ?? null,
        items: {
          object: "list",
          data: [
            {
              id: stripeId("si"),
              price: { id: input.priceId },
              current_period_start: input.periodStart ?? created,
              current_period_end: input.periodEnd ?? created + 30 * 24 * 60 * 60,
            },
          ],
        },
      },
    },
  } as unknown as Stripe.Event;
}

export function invoiceEvent(input: {
  type: "invoice.payment_failed" | "invoice.paid";
  eventId?: string;
  customerId: string;
  subscriptionId: string;
  created?: number;
}): Stripe.Event {
  return {
    id: input.eventId ?? stripeId("evt"),
    object: "event",
    type: input.type,
    created: input.created ?? nowSeconds(),
    data: {
      object: {
        id: stripeId("in"),
        object: "invoice",
        customer: input.customerId,
        parent: {
          type: "subscription_details",
          subscription_details: { subscription: input.subscriptionId },
        },
      },
    },
  } as unknown as Stripe.Event;
}

export function checkoutCompletedEvent(input: {
  eventId?: string;
  customerId: string;
  workspaceId: string;
  created?: number;
}): Stripe.Event {
  return {
    id: input.eventId ?? stripeId("evt"),
    object: "event",
    type: "checkout.session.completed",
    created: input.created ?? nowSeconds(),
    data: {
      object: {
        id: stripeId("cs"),
        object: "checkout.session",
        mode: "subscription",
        customer: input.customerId,
        client_reference_id: input.workspaceId,
      },
    },
  } as unknown as Stripe.Event;
}
