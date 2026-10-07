import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { db } from "@/db";
import { subscriptions } from "@/db/schema";
import { AGENCY_TRIAL_DAYS, PLAN_ENTITLEMENTS } from "@/lib/billing/plans";
import { setBillingGatewayForTests, type BillingGateway } from "@/lib/billing/gateway";
import { getBillingOverview, openBillingPortal, startCheckout } from "@/lib/billing/service";
import { setEmailTransportForTests } from "@/lib/email";
import { TestEmailTransport } from "@/lib/email/test-transport";
import { createProject, createWebsiteReview } from "@/lib/projects/service";
import { stripeId } from "@/test/stripe-events";
import {
  addWorkspaceMember,
  createOwnerContext,
  seedWorkspacePlan,
} from "@/test/workspace-fixtures";

type Calls = {
  customers: number;
  checkouts: {
    customerId: string;
    plan: string;
    interval: string;
    trialDays: number | null;
    successUrl: string;
    cancelUrl: string;
  }[];
  portals: { customerId: string; returnUrl: string }[];
};

function recordingGateway(overrides: Partial<BillingGateway> = {}) {
  const calls: Calls = { customers: 0, checkouts: [], portals: [] };
  const gateway: BillingGateway = {
    async createCustomer() {
      calls.customers += 1;
      return { customerId: stripeId("cus") };
    },
    async createCheckoutSession(input) {
      calls.checkouts.push(input);
      return { url: "https://checkout.example.test/session" };
    },
    async createPortalSession(input) {
      calls.portals.push(input);
      return { url: "https://portal.example.test/session" };
    },
    async cancelSubscription() {},
    ...overrides,
  };
  return { gateway, calls };
}

beforeEach(() => {
  setEmailTransportForTests(new TestEmailTransport());
});

afterEach(() => {
  setBillingGatewayForTests(null);
});

describe("startCheckout", () => {
  it("sends the owner to Checkout and creates one customer for the workspace", { timeout: 60_000 }, async () => {
    const { gateway, calls } = recordingGateway();
    setBillingGatewayForTests(gateway);
    const owner = await createOwnerContext("checkout");

    const first = await startCheckout(owner, { plan: "studio", interval: "year" });
    expect(first).toEqual({ ok: true, url: "https://checkout.example.test/session" });
    const second = await startCheckout(owner, { plan: "studio", interval: "month" });
    expect(second.ok).toBe(true);

    expect(calls.customers).toBe(1);
    expect(calls.checkouts[0]).toMatchObject({ plan: "studio", interval: "year", trialDays: null });
    expect(calls.checkouts[0].customerId).toBe(calls.checkouts[1].customerId);
    expect(calls.checkouts[0].successUrl).toContain("/settings/billing?checkout=success");
    expect(calls.checkouts[0].cancelUrl).toContain("/settings/billing?checkout=cancelled");

    // Starting Checkout never changes the plan. Only Stripe's webhook does.
    const overview = await getBillingOverview(owner);
    expect(overview?.resolution.planId).toBe("free");
  });

  it("offers the Agency trial once, and only for Agency", { timeout: 60_000 }, async () => {
    const { gateway, calls } = recordingGateway();
    setBillingGatewayForTests(gateway);
    const owner = await createOwnerContext("trialoffer");

    await startCheckout(owner, { plan: "agency", interval: "month" });
    expect(calls.checkouts[0].trialDays).toBe(AGENCY_TRIAL_DAYS);

    await db
      .update(subscriptions)
      .set({ trialStartedAt: new Date() })
      .where(eq(subscriptions.workspaceId, owner.workspaceId));
    await startCheckout(owner, { plan: "agency", interval: "month" });
    expect(calls.checkouts[1].trialDays).toBeNull();
  });

  it("refuses everyone but the owner, even if the request claims to be the owner", { timeout: 60_000 }, async () => {
    const { gateway, calls } = recordingGateway();
    setBillingGatewayForTests(gateway);
    const owner = await createOwnerContext("ownersonly");
    const member = await addWorkspaceMember(owner, "teammate");

    const asMember = await startCheckout(member, { plan: "studio", interval: "month" });
    expect(asMember).toMatchObject({ ok: false, error: "forbidden" });

    // A stale or forged context that says "owner" is checked against the database.
    const forged = { ...member, role: "owner" as const };
    const asForged = await startCheckout(forged, { plan: "studio", interval: "month" });
    expect(asForged).toMatchObject({ ok: false, error: "forbidden" });
    expect(await openBillingPortal(forged)).toMatchObject({ ok: false, error: "forbidden" });

    expect(calls.customers).toBe(0);
    expect(calls.checkouts).toHaveLength(0);
  });

  it("rejects plans and schedules that do not exist", { timeout: 60_000 }, async () => {
    const { gateway, calls } = recordingGateway();
    setBillingGatewayForTests(gateway);
    const owner = await createOwnerContext("invalid");

    for (const input of [
      { plan: "free", interval: "month" },
      { plan: "enterprise", interval: "month" },
      { plan: "studio", interval: "week" },
      { plan: undefined, interval: undefined },
    ]) {
      expect(await startCheckout(owner, input)).toMatchObject({ ok: false, error: "invalid" });
    }
    expect(calls.checkouts).toHaveLength(0);
  });

  it("explains when billing is not set up and charges nothing", { timeout: 60_000 }, async () => {
    setBillingGatewayForTests(null);
    const owner = await createOwnerContext("unconfigured");
    const result = await startCheckout(owner, { plan: "studio", interval: "month" });
    expect(result).toMatchObject({ ok: false, error: "not_configured" });
    if (!result.ok) expect(result.message).toMatch(/Nothing was charged/);
  });

  it("does not start a second subscription for a workspace that already has one", { timeout: 60_000 }, async () => {
    const { gateway, calls } = recordingGateway();
    setBillingGatewayForTests(gateway);
    const owner = await createOwnerContext("already");
    await db.insert(subscriptions).values({
      workspaceId: owner.workspaceId,
      provider: "stripe",
      providerCustomerId: stripeId("cus"),
      providerSubscriptionId: stripeId("sub"),
      plan: "studio",
      status: "active",
    });
    const result = await startCheckout(owner, { plan: "agency", interval: "month" });
    expect(result).toMatchObject({ ok: false, error: "already_subscribed" });
    expect(calls.checkouts).toHaveLength(0);
  });

  it("lets a workspace with a cancelled subscription choose a plan again", { timeout: 60_000 }, async () => {
    const { gateway, calls } = recordingGateway();
    setBillingGatewayForTests(gateway);
    const owner = await createOwnerContext("again");
    const customerId = stripeId("cus");
    await db.insert(subscriptions).values({
      workspaceId: owner.workspaceId,
      provider: "stripe",
      providerCustomerId: customerId,
      providerSubscriptionId: stripeId("sub"),
      plan: "studio",
      status: "cancelled",
      trialStartedAt: new Date(),
    });
    const result = await startCheckout(owner, { plan: "agency", interval: "year" });
    expect(result.ok).toBe(true);
    expect(calls.customers).toBe(0);
    expect(calls.checkouts[0]).toMatchObject({ customerId, trialDays: null });
  });

  it("turns a provider failure into a calm message with no technical detail", { timeout: 60_000 }, async () => {
    const { gateway } = recordingGateway({
      async createCheckoutSession() {
        throw new Error("StripeConnectionError: ECONNRESET sk_test_secret");
      },
    });
    setBillingGatewayForTests(gateway);
    const owner = await createOwnerContext("outage");
    const result = await startCheckout(owner, { plan: "studio", interval: "month" });
    expect(result).toMatchObject({ ok: false, error: "unavailable" });
    if (!result.ok) {
      expect(result.message).not.toMatch(/stripe|sk_|ECONN/i);
      expect(result.message).toMatch(/Nothing was charged/);
    }
  });
});

describe("openBillingPortal", () => {
  it("has nothing to open until a plan has been chosen", { timeout: 60_000 }, async () => {
    setBillingGatewayForTests(recordingGateway().gateway);
    const owner = await createOwnerContext("noportal");
    expect(await openBillingPortal(owner)).toMatchObject({ ok: false, error: "no_customer" });
  });

  it("opens the portal for the stored customer and returns to the billing page", { timeout: 60_000 }, async () => {
    const { gateway, calls } = recordingGateway();
    setBillingGatewayForTests(gateway);
    const owner = await createOwnerContext("portal");
    await startCheckout(owner, { plan: "studio", interval: "month" });
    const result = await openBillingPortal(owner);
    expect(result).toEqual({ ok: true, url: "https://portal.example.test/session" });
    expect(calls.portals[0].customerId).toBe(calls.checkouts[0].customerId);
    expect(calls.portals[0].returnUrl).toContain("/settings/billing");
  });
});

describe("getBillingOverview", () => {
  it("shows the same numbers to everyone but only gives the owner the controls", { timeout: 90_000 }, async () => {
    setBillingGatewayForTests(recordingGateway().gateway);
    const owner = await createOwnerContext("overview");
    await seedWorkspacePlan(owner.workspaceId, "studio");
    const member = await addWorkspaceMember(owner, "viewer");

    const asOwner = await getBillingOverview(owner);
    const asMember = await getBillingOverview(member);
    expect(asOwner?.canManage).toBe(true);
    expect(asMember?.canManage).toBe(false);
    expect(asMember?.planName).toBe(PLAN_ENTITLEMENTS.studio.name);
    expect(asMember?.members.limit).toBe(PLAN_ENTITLEMENTS.studio.workspaceMembers);
    expect(asMember?.members.seatsUsed).toBe(2);
    expect(asMember?.websites.limit).toBe(PLAN_ENTITLEMENTS.studio.activeReviewWebsites);
  });

  it("reports being over the plan without removing anything", { timeout: 120_000 }, async () => {
    const owner = await createOwnerContext("overplan");
    await seedWorkspacePlan(owner.workspaceId, "agency");
    const project = await createProject(owner, "Over plan");
    if (!project.ok) throw new Error("project failed");
    for (const name of ["a", "b"]) {
      const review = await createWebsiteReview(owner, {
        projectId: project.project.id,
        name,
        websiteUrl: `https://${name}.overplan.example.com`,
      });
      expect(review.ok).toBe(true);
    }
    await seedWorkspacePlan(owner.workspaceId, "free");

    const overview = await getBillingOverview(owner);
    expect(overview?.over.websites).toBe(true);
    expect(overview?.websites.used).toBe(2);
    expect(overview?.planName).toBe("Free");
  });

  it("falls back to Free limits for a lapsed payment but keeps the record", { timeout: 60_000 }, async () => {
    const owner = await createOwnerContext("lapsedview");
    await db.insert(subscriptions).values({
      workspaceId: owner.workspaceId,
      provider: "stripe",
      providerCustomerId: stripeId("cus"),
      providerSubscriptionId: stripeId("sub"),
      plan: "agency",
      status: "past_due",
      pastDueSince: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
    });
    const overview = await getBillingOverview(owner);
    expect(overview).toMatchObject({ planName: "Free", state: "payment_lapsed", hasSubscription: true });
    expect(overview?.resolution.purchasedPlanId).toBe("agency");
    expect(overview?.members.limit).toBe(PLAN_ENTITLEMENTS.free.workspaceMembers);
  });
});
