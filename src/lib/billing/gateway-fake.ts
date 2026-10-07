import "server-only";

import { randomUUID } from "node:crypto";

import type { BillingGateway } from "@/lib/billing/gateway";

/**
 * Used only by automated browser tests (see fakeBillingGatewayEnabled). It never contacts
 * Stripe and never changes a subscription: "paying" here only sends the browser back to
 * Passoff, exactly like a real success redirect, and the test then delivers a signed
 * webhook to prove that only the webhook changes the plan.
 */
export function createFakeBillingGateway(): BillingGateway {
  return {
    async createCustomer() {
      return { customerId: `cus_fake_${randomUUID().replaceAll("-", "").slice(0, 14)}` };
    },
    async createCheckoutSession(input) {
      const url = new URL(input.successUrl);
      url.searchParams.set("fake_plan", input.plan);
      url.searchParams.set("fake_interval", input.interval);
      url.searchParams.set("fake_trial", input.trialDays ? String(input.trialDays) : "0");
      return { url: url.toString() };
    },
    async createPortalSession(input) {
      return { url: input.returnUrl };
    },
    async cancelSubscription() {},
  };
}
