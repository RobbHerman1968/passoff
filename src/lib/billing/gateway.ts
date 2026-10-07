import "server-only";

import { createFakeBillingGateway } from "@/lib/billing/gateway-fake";
import { createStripeGateway } from "@/lib/billing/stripe-gateway";
import {
  canStartBilling,
  fakeBillingGatewayEnabled,
  readBillingEnvironment,
  type BillingInterval,
  type PaidPlanId,
} from "@/lib/billing/stripe-config";

/**
 * Everything Passoff asks of the payment provider, and nothing more. Passoff never sees a
 * card number: people enter payment details on pages Stripe hosts and come back to us.
 */
export type BillingGateway = {
  createCustomer(input: {
    workspaceId: string;
    workspaceName: string;
    ownerEmail: string | null;
  }): Promise<{ customerId: string }>;
  createCheckoutSession(input: {
    customerId: string;
    workspaceId: string;
    plan: PaidPlanId;
    interval: BillingInterval;
    /** Null when the workspace has already used its trial. */
    trialDays: number | null;
    successUrl: string;
    cancelUrl: string;
  }): Promise<{ url: string }>;
  createPortalSession(input: {
    customerId: string;
    returnUrl: string;
  }): Promise<{ url: string }>;
  /** Stops a second, duplicate subscription for the same workspace. */
  cancelSubscription(subscriptionId: string): Promise<void>;
};

let override: BillingGateway | null = null;

export function setBillingGatewayForTests(gateway: BillingGateway | null) {
  override = gateway;
}

/** Null when this server is not set up to talk to the payment provider. */
export function getBillingGateway(): BillingGateway | null {
  if (override) return override;
  if (fakeBillingGatewayEnabled()) return createFakeBillingGateway();
  const config = readBillingEnvironment();
  if (!canStartBilling(config)) return null;
  return createStripeGateway(config);
}

export function isBillingConfigured(): boolean {
  return Boolean(override) || fakeBillingGatewayEnabled() || canStartBilling(readBillingEnvironment());
}
