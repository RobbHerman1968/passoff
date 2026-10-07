import { describe, expect, it } from "vitest";

import {
  canStartBilling,
  fakeBillingGatewayEnabled,
  isBillingInterval,
  isPaidPlanId,
  planForPriceId,
  priceIdFor,
  readBillingEnvironment,
  type StripePrices,
} from "@/lib/billing/stripe-config";

const validEnv = {
  STRIPE_SECRET_KEY: "sk_test_abc123",
  STRIPE_WEBHOOK_SECRET: "whsec_abc123",
  STRIPE_PRICE_STUDIO_MONTHLY: "price_studio_month",
  STRIPE_PRICE_STUDIO_ANNUAL: "price_studio_year",
  STRIPE_PRICE_AGENCY_MONTHLY: "price_agency_month",
  STRIPE_PRICE_AGENCY_ANNUAL: "price_agency_year",
};

describe("readBillingEnvironment", () => {
  it("reads a complete, well-formed configuration", () => {
    const config = readBillingEnvironment(validEnv);
    expect(config.secretKey).toBe("sk_test_abc123");
    expect(config.webhookSecret).toBe("whsec_abc123");
    expect(config.prices?.agency.year).toBe("price_agency_year");
    expect(canStartBilling(config)).toBe(true);
  });

  it("accepts a restricted key", () => {
    expect(readBillingEnvironment({ ...validEnv, STRIPE_SECRET_KEY: "rk_live_abc" }).secretKey).toBe(
      "rk_live_abc",
    );
  });

  it("rejects a publishable key pasted in place of the secret key", () => {
    const config = readBillingEnvironment({ ...validEnv, STRIPE_SECRET_KEY: "pk_test_abc" });
    expect(config.secretKey).toBeNull();
    expect(canStartBilling(config)).toBe(false);
  });

  it("rejects a webhook secret that is not a signing secret", () => {
    expect(readBillingEnvironment({ ...validEnv, STRIPE_WEBHOOK_SECRET: "abc" }).webhookSecret).toBeNull();
  });

  it("needs all four price IDs", () => {
    const { STRIPE_PRICE_AGENCY_ANNUAL: _omit, ...missing } = validEnv;
    void _omit;
    expect(readBillingEnvironment(missing).prices).toBeNull();
    expect(canStartBilling(readBillingEnvironment(missing))).toBe(false);
  });

  it("rejects a price ID that does not look like one", () => {
    expect(
      readBillingEnvironment({ ...validEnv, STRIPE_PRICE_STUDIO_MONTHLY: "prod_123" }).prices,
    ).toBeNull();
  });

  it("rejects two plans sharing one price, which would make every purchase look the same", () => {
    expect(
      readBillingEnvironment({ ...validEnv, STRIPE_PRICE_AGENCY_MONTHLY: "price_studio_month" }).prices,
    ).toBeNull();
  });

  it("treats blank values as missing", () => {
    const config = readBillingEnvironment({ ...validEnv, STRIPE_SECRET_KEY: "   " });
    expect(config.secretKey).toBeNull();
  });

  it("only keeps a well-formed portal configuration", () => {
    expect(readBillingEnvironment({ ...validEnv, STRIPE_BILLING_PORTAL_CONFIGURATION_ID: "bpc_123" }).portalConfigurationId).toBe("bpc_123");
    expect(readBillingEnvironment({ ...validEnv, STRIPE_BILLING_PORTAL_CONFIGURATION_ID: "nope" }).portalConfigurationId).toBeNull();
  });
});

describe("price mapping", () => {
  const prices = readBillingEnvironment(validEnv).prices as StripePrices;

  it("maps a plan and schedule to its price", () => {
    expect(priceIdFor(prices, "studio", "month")).toBe("price_studio_month");
    expect(priceIdFor(prices, "agency", "year")).toBe("price_agency_year");
  });

  it("maps a price back to the plan and schedule", () => {
    expect(planForPriceId(prices, "price_agency_month")).toEqual({ plan: "agency", interval: "month" });
    expect(planForPriceId(prices, "price_studio_year")).toEqual({ plan: "studio", interval: "year" });
  });

  it("does not know a price it was not told about", () => {
    expect(planForPriceId(prices, "price_other")).toBeNull();
    expect(planForPriceId(prices, null)).toBeNull();
    expect(planForPriceId(null, "price_studio_month")).toBeNull();
  });
});

describe("guards", () => {
  it("accepts only paid plans and known schedules", () => {
    expect(isPaidPlanId("studio")).toBe(true);
    expect(isPaidPlanId("agency")).toBe(true);
    expect(isPaidPlanId("free")).toBe(false);
    expect(isPaidPlanId("enterprise")).toBe(false);
    expect(isBillingInterval("month")).toBe(true);
    expect(isBillingInterval("year")).toBe(true);
    expect(isBillingInterval("week")).toBe(false);
  });

  it("allows the fake gateway only for test email transport outside production", () => {
    expect(fakeBillingGatewayEnabled({ PASSOFF_BILLING_GATEWAY: "fake", EMAIL_TRANSPORT: "test" })).toBe(true);
    expect(fakeBillingGatewayEnabled({ PASSOFF_BILLING_GATEWAY: "fake" })).toBe(false);
    expect(
      fakeBillingGatewayEnabled({ PASSOFF_BILLING_GATEWAY: "fake", EMAIL_TRANSPORT: "test", NODE_ENV: "production" }),
    ).toBe(false);
  });
});
