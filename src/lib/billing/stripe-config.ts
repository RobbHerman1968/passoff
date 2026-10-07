import { PLAN_IDS, type PlanId } from "@/lib/billing/plans";

/**
 * Stripe configuration read from the environment. Nothing here knows a price in dollars:
 * amounts live in src/lib/billing/plans.ts and are mirrored once, by hand, onto the Stripe
 * Price objects named below. This file only maps a Stripe price ID to a plan and schedule.
 */
export const PAID_PLAN_IDS = ["studio", "agency"] as const satisfies readonly PlanId[];
export type PaidPlanId = (typeof PAID_PLAN_IDS)[number];

export const BILLING_INTERVALS = ["month", "year"] as const;
export type BillingInterval = (typeof BILLING_INTERVALS)[number];

export const PRICE_ENV_NAMES: Record<PaidPlanId, Record<BillingInterval, string>> = {
  studio: { month: "STRIPE_PRICE_STUDIO_MONTHLY", year: "STRIPE_PRICE_STUDIO_ANNUAL" },
  agency: { month: "STRIPE_PRICE_AGENCY_MONTHLY", year: "STRIPE_PRICE_AGENCY_ANNUAL" },
};

export function isPaidPlanId(value: unknown): value is PaidPlanId {
  return typeof value === "string" && (PAID_PLAN_IDS as readonly string[]).includes(value);
}

export function isBillingInterval(value: unknown): value is BillingInterval {
  return typeof value === "string" && (BILLING_INTERVALS as readonly string[]).includes(value);
}

export function isPlanId(value: unknown): value is PlanId {
  return typeof value === "string" && (PLAN_IDS as readonly string[]).includes(value);
}

export type StripePrices = Record<PaidPlanId, Record<BillingInterval, string>>;

export type BillingEnvironment = {
  secretKey: string | null;
  webhookSecret: string | null;
  /** Null unless all four price IDs are present, well formed, and different from each other. */
  prices: StripePrices | null;
  /** Optional Billing Portal configuration. The Stripe default is used when empty. */
  portalConfigurationId: string | null;
};

type Env = Record<string, string | undefined>;

function clean(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function readPrices(env: Env): StripePrices | null {
  const found: Partial<StripePrices> = {};
  const seen = new Set<string>();
  for (const plan of PAID_PLAN_IDS) {
    for (const interval of BILLING_INTERVALS) {
      const value = clean(env[PRICE_ENV_NAMES[plan][interval]]);
      // Stripe price IDs always start with "price_". Anything else is a paste mistake.
      if (!value || !/^price_[A-Za-z0-9_]+$/.test(value)) return null;
      // Two plans sharing one price would make every purchase look like the first plan.
      if (seen.has(value)) return null;
      seen.add(value);
      found[plan] = { ...found[plan], [interval]: value } as Record<BillingInterval, string>;
    }
  }
  return found as StripePrices;
}

export function readBillingEnvironment(env: Env = process.env): BillingEnvironment {
  const secretKey = clean(env.STRIPE_SECRET_KEY);
  const webhookSecret = clean(env.STRIPE_WEBHOOK_SECRET);
  const portal = clean(env.STRIPE_BILLING_PORTAL_CONFIGURATION_ID);
  return {
    secretKey: secretKey && /^(sk|rk)_(test|live)_/.test(secretKey) ? secretKey : null,
    webhookSecret: webhookSecret && webhookSecret.startsWith("whsec_") ? webhookSecret : null,
    prices: readPrices(env),
    portalConfigurationId: portal && portal.startsWith("bpc_") ? portal : null,
  };
}

/** True when this server can start Checkout and open the Billing Portal. */
export function canStartBilling(config: BillingEnvironment): boolean {
  return Boolean(config.secretKey && config.prices);
}

export function priceIdFor(
  prices: StripePrices,
  plan: PaidPlanId,
  interval: BillingInterval,
): string {
  return prices[plan][interval];
}

export function planForPriceId(
  prices: StripePrices | null,
  priceId: string | null | undefined,
): { plan: PaidPlanId; interval: BillingInterval } | null {
  if (!prices || !priceId) return null;
  for (const plan of PAID_PLAN_IDS) {
    for (const interval of BILLING_INTERVALS) {
      if (prices[plan][interval] === priceId) return { plan, interval };
    }
  }
  return null;
}

/** The fake gateway is for automated browser tests only and is never available in production. */
export function fakeBillingGatewayEnabled(env: Env = process.env): boolean {
  return (
    env.PASSOFF_BILLING_GATEWAY === "fake" &&
    env.EMAIL_TRANSPORT === "test" &&
    env.NODE_ENV !== "production"
  );
}
