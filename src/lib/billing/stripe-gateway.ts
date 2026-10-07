import "server-only";

import Stripe from "stripe";

import { AGENCY_TRIAL_DAYS } from "@/lib/billing/plans";
import type { BillingGateway } from "@/lib/billing/gateway";
import {
  priceIdFor,
  type BillingEnvironment,
  type StripePrices,
} from "@/lib/billing/stripe-config";

let cachedClient: { key: string; client: Stripe } | null = null;

function stripeClient(secretKey: string): Stripe {
  if (cachedClient?.key === secretKey) return cachedClient.client;
  const client = new Stripe(secretKey, {
    maxNetworkRetries: 2,
    timeout: 20_000,
    appInfo: { name: "Passoff" },
  });
  cachedClient = { key: secretKey, client };
  return client;
}

export function createStripeGateway(
  config: BillingEnvironment & { secretKey: string | null; prices: StripePrices | null },
  env: Record<string, string | undefined> = process.env,
): BillingGateway {
  const secretKey = config.secretKey;
  const prices = config.prices;
  if (!secretKey || !prices) {
    throw new Error("Stripe is not configured.");
  }
  const stripe = stripeClient(secretKey);

  return {
    async createCustomer(input) {
      const customer = await stripe.customers.create(
        {
          name: input.workspaceName,
          email: input.ownerEmail ?? undefined,
          metadata: { passoffWorkspaceId: input.workspaceId },
        },
        // A repeated click or a retry lands on the same Stripe customer.
        { idempotencyKey: `passoff-customer-${input.workspaceId}` },
      );
      return { customerId: customer.id };
    },

    async createCheckoutSession(input) {
      const trial = input.trialDays && input.plan === "agency" ? Math.min(input.trialDays, AGENCY_TRIAL_DAYS) : null;
      const automaticTax = env.STRIPE_AUTOMATIC_TAX === "true";
      const session = await stripe.checkout.sessions.create({
        mode: "subscription",
        customer: input.customerId,
        client_reference_id: input.workspaceId,
        line_items: [{ price: priceIdFor(prices, input.plan, input.interval), quantity: 1 }],
        success_url: input.successUrl,
        cancel_url: input.cancelUrl,
        billing_address_collection: "auto",
        metadata: { passoffWorkspaceId: input.workspaceId },
        // Taxes are added at checkout when Stripe Tax is switched on for the account.
        ...(automaticTax
          ? {
              automatic_tax: { enabled: true },
              customer_update: { address: "auto" as const, name: "auto" as const },
            }
          : {}),
        // A trial needs no card up front. If nothing is added by the end, the plan simply
        // stops and the workspace moves to Free with all of its work intact.
        ...(trial ? { payment_method_collection: "if_required" as const } : {}),
        subscription_data: {
          metadata: { passoffWorkspaceId: input.workspaceId, passoffPlan: input.plan },
          ...(trial
            ? {
                trial_period_days: trial,
                trial_settings: { end_behavior: { missing_payment_method: "cancel" as const } },
              }
            : {}),
        },
      });
      if (!session.url) throw new Error("Stripe did not return a checkout address.");
      return { url: session.url };
    },

    async createPortalSession(input) {
      const portalConfiguration = env.STRIPE_BILLING_PORTAL_CONFIGURATION_ID?.trim();
      const session = await stripe.billingPortal.sessions.create({
        customer: input.customerId,
        return_url: input.returnUrl,
        ...(portalConfiguration?.startsWith("bpc_") ? { configuration: portalConfiguration } : {}),
      });
      return { url: session.url };
    },

    async cancelSubscription(subscriptionId) {
      await stripe.subscriptions.cancel(subscriptionId);
    },
  };
}
