import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { db } from "@/db";
import { providerEvents, subscriptions } from "@/db/schema";
import { setEmailTransportForTests } from "@/lib/email";
import { TestEmailTransport } from "@/lib/email/test-transport";
import type { BillingGateway } from "@/lib/billing/gateway";
import { loadSubscription, resolveWorkspaceEntitlement } from "@/lib/billing/effective-plan";
import { notifyLapsedWorkspaces } from "@/lib/billing/lapse";
import { processStripeEvent, STRIPE_PROVIDER } from "@/lib/billing/webhook-service";
import { listNotificationsForUser } from "@/lib/notifications/service";
import { createProject, createWebsiteReview } from "@/lib/projects/service";
import { createOwnerContext } from "@/test/workspace-fixtures";
import {
  TEST_PRICES,
  checkoutCompletedEvent,
  invoiceEvent,
  stripeId,
  subscriptionEvent,
} from "@/test/stripe-events";

const DAY_SECONDS = 24 * 60 * 60;
const nowSeconds = () => Math.floor(Date.now() / 1000);

function fakeGateway() {
  const cancelled: string[] = [];
  const gateway: BillingGateway = {
    createCustomer: async () => ({ customerId: stripeId("cus") }),
    createCheckoutSession: async () => ({ url: "https://example.test/checkout" }),
    createPortalSession: async () => ({ url: "https://example.test/portal" }),
    cancelSubscription: async (id) => {
      cancelled.push(id);
    },
  };
  return { gateway, cancelled };
}

async function seedStripeWorkspace(label: string) {
  const context = await createOwnerContext(label);
  const customerId = stripeId("cus");
  await db.insert(subscriptions).values({
    workspaceId: context.workspaceId,
    provider: STRIPE_PROVIDER,
    providerCustomerId: customerId,
    plan: "free",
    status: "active",
  });
  return { context, customerId };
}

const options = (gateway: BillingGateway | null = null) => ({
  gateway,
  prices: TEST_PRICES,
});

async function notificationTypes(userId: string) {
  const inbox = await listNotificationsForUser(userId);
  return inbox.items.map((item) => item.type);
}

beforeEach(() => {
  setEmailTransportForTests(new TestEmailTransport());
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Stripe webhook processing", () => {
  it("starts an Agency trial from the subscription event and tells the owner", { timeout: 60_000 }, async () => {
    const { context, customerId } = await seedStripeWorkspace("trial");
    const subscriptionId = stripeId("sub");
    const created = nowSeconds();

    const outcome = await processStripeEvent(
      subscriptionEvent({
        type: "customer.subscription.created",
        customerId,
        subscriptionId,
        priceId: TEST_PRICES.agency.month,
        status: "trialing",
        created,
        trialStart: created,
        trialEnd: created + 14 * DAY_SECONDS,
      }),
      options(),
    );
    expect(outcome).toEqual({ status: "processed" });

    const stored = await loadSubscription(db, context.workspaceId);
    expect(stored).toMatchObject({
      plan: "agency",
      status: "trialing",
      billingInterval: "month",
      providerSubscriptionId: subscriptionId,
    });
    expect(stored?.trialStartedAt).toBeInstanceOf(Date);
    expect(stored?.trialEndsAt?.getTime()).toBe((created + 14 * DAY_SECONDS) * 1000);

    const resolved = await resolveWorkspaceEntitlement(db, context.workspaceId);
    expect(resolved).toMatchObject({ planId: "agency", state: "trialing" });
    expect(await notificationTypes(context.userId)).toContain("billing.plan_started");
  });

  it("does nothing the second time Stripe sends the same event", { timeout: 60_000 }, async () => {
    const { context, customerId } = await seedStripeWorkspace("dupe");
    const event = subscriptionEvent({
      customerId,
      subscriptionId: stripeId("sub"),
      priceId: TEST_PRICES.studio.year,
      status: "active",
    });

    expect(await processStripeEvent(event, options())).toEqual({ status: "processed" });
    expect(await processStripeEvent(event, options())).toEqual({ status: "duplicate" });

    const receipts = await db.select().from(providerEvents).where(eq(providerEvents.providerEventId, event.id));
    expect(receipts).toHaveLength(1);
    const started = (await notificationTypes(context.userId)).filter((type) => type === "billing.plan_started");
    expect(started).toHaveLength(1);
  });

  it("does not grant a plan when Checkout completes; only subscription events do", { timeout: 60_000 }, async () => {
    const { context, customerId } = await seedStripeWorkspace("checkout");
    const outcome = await processStripeEvent(
      checkoutCompletedEvent({ customerId, workspaceId: context.workspaceId }),
      options(),
    );
    expect(outcome.status).toBe("processed");
    expect((await resolveWorkspaceEntitlement(db, context.workspaceId)).planId).toBe("free");
  });

  it("ignores a checkout that names a different workspace", { timeout: 60_000 }, async () => {
    const { customerId } = await seedStripeWorkspace("mismatch");
    const other = await createOwnerContext("mismatch-other");
    const outcome = await processStripeEvent(
      checkoutCompletedEvent({ customerId, workspaceId: other.workspaceId }),
      options(),
    );
    expect(outcome).toMatchObject({ status: "ignored" });
  });

  it("never grants a plan for a price it does not recognise", { timeout: 60_000 }, async () => {
    const { context, customerId } = await seedStripeWorkspace("unknownprice");
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const outcome = await processStripeEvent(
      subscriptionEvent({
        customerId,
        subscriptionId: stripeId("sub"),
        priceId: "price_not_in_catalog",
        status: "active",
      }),
      options(),
    );
    expect(outcome).toEqual({ status: "ignored", reason: "unknown price" });
    expect(error).toHaveBeenCalled();
    expect((await resolveWorkspaceEntitlement(db, context.workspaceId)).planId).toBe("free");
  });

  it("ignores events for customers it has never seen", { timeout: 60_000 }, async () => {
    const outcome = await processStripeEvent(
      subscriptionEvent({
        customerId: stripeId("cus"),
        subscriptionId: stripeId("sub"),
        priceId: TEST_PRICES.studio.month,
        status: "active",
      }),
      options(),
    );
    expect(outcome).toEqual({ status: "ignored", reason: "unknown customer" });
  });

  it("does not give a plan to an unpaid first attempt", { timeout: 60_000 }, async () => {
    const { context, customerId } = await seedStripeWorkspace("incomplete");
    const outcome = await processStripeEvent(
      subscriptionEvent({
        customerId,
        subscriptionId: stripeId("sub"),
        priceId: TEST_PRICES.studio.month,
        status: "incomplete",
      }),
      options(),
    );
    expect(outcome.status).toBe("ignored");
    expect((await resolveWorkspaceEntitlement(db, context.workspaceId)).planId).toBe("free");
  });

  it("keeps newer state when an older event arrives late", { timeout: 60_000 }, async () => {
    const { context, customerId } = await seedStripeWorkspace("order");
    const subscriptionId = stripeId("sub");
    const t = nowSeconds();

    await processStripeEvent(
      subscriptionEvent({
        customerId,
        subscriptionId,
        priceId: TEST_PRICES.studio.month,
        status: "active",
        created: t,
      }),
      options(),
    );
    const late = await processStripeEvent(
      subscriptionEvent({
        customerId,
        subscriptionId,
        priceId: TEST_PRICES.agency.month,
        status: "active",
        created: t - 600,
      }),
      options(),
    );
    expect(late).toEqual({ status: "ignored", reason: "older than stored state" });
    expect((await loadSubscription(db, context.workspaceId))?.plan).toBe("studio");
  });

  it("rolls the receipt back when handling fails, so Stripe's retry does the job", { timeout: 60_000 }, async () => {
    const { context, customerId } = await seedStripeWorkspace("rollback");
    const subscriptionId = stripeId("sub");
    const good = subscriptionEvent({
      customerId,
      subscriptionId,
      priceId: TEST_PRICES.studio.month,
      status: "active",
    });

    const broken = subscriptionEvent({
      eventId: good.id,
      customerId,
      subscriptionId,
      priceId: TEST_PRICES.studio.month,
      status: "active",
    });
    const item = (broken.data.object as unknown as { items: { data: Record<string, unknown>[] } }).items.data[0];
    Object.defineProperty(item, "current_period_end", {
      get() {
        throw new Error("simulated failure");
      },
    });

    await expect(processStripeEvent(broken, options())).rejects.toThrow("simulated failure");
    const receipts = await db.select().from(providerEvents).where(eq(providerEvents.providerEventId, good.id));
    expect(receipts).toHaveLength(0);
    expect((await resolveWorkspaceEntitlement(db, context.workspaceId)).planId).toBe("free");

    expect(await processStripeEvent(good, options())).toEqual({ status: "processed" });
    expect((await resolveWorkspaceEntitlement(db, context.workspaceId)).planId).toBe("studio");
  });

  it("changes plan when the owner switches plans in the portal", { timeout: 60_000 }, async () => {
    const { context, customerId } = await seedStripeWorkspace("switch");
    const subscriptionId = stripeId("sub");
    const t = nowSeconds();
    await processStripeEvent(
      subscriptionEvent({ customerId, subscriptionId, priceId: TEST_PRICES.studio.month, status: "active", created: t }),
      options(),
    );
    await processStripeEvent(
      subscriptionEvent({ customerId, subscriptionId, priceId: TEST_PRICES.agency.year, status: "active", created: t + 60 }),
      options(),
    );
    const stored = await loadSubscription(db, context.workspaceId);
    expect(stored).toMatchObject({ plan: "agency", billingInterval: "year" });
    expect(await notificationTypes(context.userId)).toContain("billing.plan_changed");
  });

  it("marks cancelling when the owner cancels at the end of the period", { timeout: 60_000 }, async () => {
    const { context, customerId } = await seedStripeWorkspace("cancelling");
    await processStripeEvent(
      subscriptionEvent({
        customerId,
        subscriptionId: stripeId("sub"),
        priceId: TEST_PRICES.studio.month,
        status: "active",
        cancelAtPeriodEnd: true,
      }),
      options(),
    );
    expect(await resolveWorkspaceEntitlement(db, context.workspaceId)).toMatchObject({
      planId: "studio",
      state: "cancelling",
    });
  });
});

describe("failed payments and the grace period", () => {
  async function activeWorkspace(label: string) {
    const seeded = await seedStripeWorkspace(label);
    const subscriptionId = stripeId("sub");
    const t = nowSeconds() - 3600;
    await processStripeEvent(
      subscriptionEvent({
        customerId: seeded.customerId,
        subscriptionId,
        priceId: TEST_PRICES.agency.month,
        status: "active",
        created: t,
      }),
      options(),
    );
    return { ...seeded, subscriptionId, t };
  }

  it("keeps the paid plan, notes when trouble started, and warns the owner once", { timeout: 90_000 }, async () => {
    const { context, customerId, subscriptionId, t } = await activeWorkspace("pastdue");

    await processStripeEvent(
      invoiceEvent({ type: "invoice.payment_failed", customerId, subscriptionId, created: t + 60 }),
      options(),
    );
    const first = await loadSubscription(db, context.workspaceId);
    expect(first?.status).toBe("past_due");
    expect(first?.pastDueSince?.getTime()).toBe((t + 60) * 1000);
    expect(await resolveWorkspaceEntitlement(db, context.workspaceId)).toMatchObject({
      planId: "agency",
      state: "past_due",
    });

    // Stripe retries the charge; the clock for the grace period must not restart.
    await processStripeEvent(
      invoiceEvent({ type: "invoice.payment_failed", customerId, subscriptionId, created: t + 3 * DAY_SECONDS }),
      options(),
    );
    const second = await loadSubscription(db, context.workspaceId);
    expect(second?.pastDueSince?.getTime()).toBe((t + 60) * 1000);

    const failed = (await notificationTypes(context.userId)).filter((type) => type === "billing.payment_failed");
    expect(failed).toHaveLength(1);
  });

  it("returns to active and tells the owner when the payment goes through", { timeout: 90_000 }, async () => {
    const { context, customerId, subscriptionId, t } = await activeWorkspace("recover");
    await processStripeEvent(
      invoiceEvent({ type: "invoice.payment_failed", customerId, subscriptionId, created: t + 60 }),
      options(),
    );
    await processStripeEvent(
      invoiceEvent({ type: "invoice.paid", customerId, subscriptionId, created: t + 120 }),
      options(),
    );
    const stored = await loadSubscription(db, context.workspaceId);
    expect(stored).toMatchObject({ status: "active", pastDueSince: null });
    expect(await notificationTypes(context.userId)).toContain("billing.payment_recovered");
  });

  it("treats an ordinary paid invoice as a no-op", { timeout: 90_000 }, async () => {
    const { customerId, subscriptionId, t } = await activeWorkspace("renewal");
    const outcome = await processStripeEvent(
      invoiceEvent({ type: "invoice.paid", customerId, subscriptionId, created: t + 60 }),
      options(),
    );
    expect(outcome).toEqual({ status: "ignored", reason: "nothing was overdue" });
  });

  it("falls back to Free limits after the grace period and keeps every piece of work", { timeout: 120_000 }, async () => {
    const { context, customerId, subscriptionId, t } = await activeWorkspace("lapse");

    const project = await createProject(context, "Kept project");
    if (!project.ok) throw new Error("project failed");
    for (const name of ["First", "Second"]) {
      const review = await createWebsiteReview(context, {
        projectId: project.project.id,
        name,
        websiteUrl: `https://${name.toLowerCase()}.lapse.example.com`,
      });
      expect(review.ok).toBe(true);
    }

    await processStripeEvent(
      invoiceEvent({ type: "invoice.payment_failed", customerId, subscriptionId, created: t + 60 }),
      options(),
    );
    // Move the first failure back past the grace period.
    await db
      .update(subscriptions)
      .set({ pastDueSince: new Date(Date.now() - 9 * DAY_SECONDS * 1000) })
      .where(eq(subscriptions.workspaceId, context.workspaceId));

    const resolved = await resolveWorkspaceEntitlement(db, context.workspaceId);
    expect(resolved).toMatchObject({ planId: "free", state: "payment_lapsed", purchasedPlanId: "agency" });

    // Nothing was deleted: both reviews are still there, over the Free limit but readable.
    const { listProjectReviews } = await import("@/lib/projects/service");
    const reviews = await listProjectReviews(context, project.project.id, {});
    expect(reviews?.map((review) => review.name).sort()).toEqual(["First", "Second"]);

    // Only new additions pause, and the message says what to do.
    const blocked = await createWebsiteReview(context, {
      projectId: project.project.id,
      name: "Third",
      websiteUrl: "https://third.lapse.example.com",
    });
    expect(blocked).toMatchObject({ ok: false, error: "plan_limit" });
    if (!blocked.ok) expect(blocked.message).toMatch(/Billing page/);

    const first = await notifyLapsedWorkspaces(new Date(), { workspaceId: context.workspaceId });
    expect(first).toEqual({ checked: 1, notified: 1 });
    const again = await notifyLapsedWorkspaces(new Date(), { workspaceId: context.workspaceId });
    expect(again.notified).toBe(0);
    const lapsed = (await notificationTypes(context.userId)).filter((type) => type === "billing.payment_lapsed");
    expect(lapsed).toHaveLength(1);
  });
});

describe("one subscription and one trial per workspace", () => {
  it("cancels a second live subscription instead of billing twice", { timeout: 60_000 }, async () => {
    const { context, customerId } = await seedStripeWorkspace("double");
    const { gateway, cancelled } = fakeGateway();
    const first = stripeId("sub");
    const second = stripeId("sub");
    const t = nowSeconds();

    await processStripeEvent(
      subscriptionEvent({ customerId, subscriptionId: first, priceId: TEST_PRICES.studio.month, status: "active", created: t }),
      options(gateway),
    );
    const outcome = await processStripeEvent(
      subscriptionEvent({ customerId, subscriptionId: second, priceId: TEST_PRICES.agency.month, status: "active", created: t + 30 }),
      options(gateway),
    );
    expect(outcome.status).toBe("ignored");
    expect(cancelled).toEqual([second]);
    expect(await loadSubscription(db, context.workspaceId)).toMatchObject({
      providerSubscriptionId: first,
      plan: "studio",
    });
  });

  it("stops a second trial for a workspace that already had one", { timeout: 60_000 }, async () => {
    const { context, customerId } = await seedStripeWorkspace("retrial");
    const { gateway, cancelled } = fakeGateway();
    const t = nowSeconds();
    const firstSub = stripeId("sub");

    await processStripeEvent(
      subscriptionEvent({
        customerId,
        subscriptionId: firstSub,
        priceId: TEST_PRICES.agency.month,
        status: "trialing",
        created: t,
        trialStart: t,
        trialEnd: t + 14 * DAY_SECONDS,
      }),
      options(gateway),
    );
    await processStripeEvent(
      subscriptionEvent({
        type: "customer.subscription.deleted",
        customerId,
        subscriptionId: firstSub,
        priceId: TEST_PRICES.agency.month,
        status: "canceled",
        created: t + 60,
      }),
      options(gateway),
    );
    expect((await resolveWorkspaceEntitlement(db, context.workspaceId)).planId).toBe("free");

    const secondSub = stripeId("sub");
    const outcome = await processStripeEvent(
      subscriptionEvent({
        customerId,
        subscriptionId: secondSub,
        priceId: TEST_PRICES.agency.month,
        status: "trialing",
        created: t + 120,
        trialStart: t + 120,
        trialEnd: t + 120 + 14 * DAY_SECONDS,
      }),
      options(gateway),
    );
    expect(outcome).toEqual({ status: "ignored", reason: "trial already used" });
    expect(cancelled).toEqual([secondSub]);
    expect((await resolveWorkspaceEntitlement(db, context.workspaceId)).planId).toBe("free");
  });

  it("lets a workspace subscribe again, without a trial, after cancelling", { timeout: 60_000 }, async () => {
    const { context, customerId } = await seedStripeWorkspace("resub");
    const t = nowSeconds();
    const firstSub = stripeId("sub");
    await processStripeEvent(
      subscriptionEvent({ customerId, subscriptionId: firstSub, priceId: TEST_PRICES.studio.month, status: "active", created: t }),
      options(),
    );
    await processStripeEvent(
      subscriptionEvent({ type: "customer.subscription.deleted", customerId, subscriptionId: firstSub, priceId: TEST_PRICES.studio.month, status: "canceled", created: t + 60 }),
      options(),
    );
    const secondSub = stripeId("sub");
    await processStripeEvent(
      subscriptionEvent({ customerId, subscriptionId: secondSub, priceId: TEST_PRICES.agency.year, status: "active", created: t + 120 }),
      options(),
    );
    expect(await loadSubscription(db, context.workspaceId)).toMatchObject({
      providerSubscriptionId: secondSub,
      plan: "agency",
      status: "active",
    });
  });
});

describe("cancelling and ending", () => {
  it("moves to Free when the subscription ends, keeps the record, and tells the owner", { timeout: 60_000 }, async () => {
    const { context, customerId } = await seedStripeWorkspace("ended");
    const subscriptionId = stripeId("sub");
    const t = nowSeconds();
    await processStripeEvent(
      subscriptionEvent({ customerId, subscriptionId, priceId: TEST_PRICES.studio.month, status: "active", created: t }),
      options(),
    );
    await processStripeEvent(
      subscriptionEvent({ type: "customer.subscription.deleted", customerId, subscriptionId, priceId: TEST_PRICES.studio.month, status: "canceled", created: t + 60 }),
      options(),
    );
    const stored = await loadSubscription(db, context.workspaceId);
    expect(stored).toMatchObject({ status: "cancelled", plan: "studio" });
    expect(stored?.cancelledAt).toBeInstanceOf(Date);
    expect(await resolveWorkspaceEntitlement(db, context.workspaceId)).toMatchObject({
      planId: "free",
      state: "cancelled",
    });
    expect(await notificationTypes(context.userId)).toContain("billing.subscription_ended");
  });

  it("warns the owner once before a trial ends", { timeout: 60_000 }, async () => {
    const { context, customerId } = await seedStripeWorkspace("trialending");
    const subscriptionId = stripeId("sub");
    const t = nowSeconds();
    await processStripeEvent(
      subscriptionEvent({
        customerId,
        subscriptionId,
        priceId: TEST_PRICES.agency.month,
        status: "trialing",
        created: t,
        trialStart: t,
        trialEnd: t + 3 * DAY_SECONDS,
      }),
      options(),
    );
    const warn = () =>
      processStripeEvent(
        subscriptionEvent({
          type: "customer.subscription.trial_will_end",
          customerId,
          subscriptionId,
          priceId: TEST_PRICES.agency.month,
          status: "trialing",
          trialEnd: t + 3 * DAY_SECONDS,
        }),
        options(),
      );
    expect((await warn()).status).toBe("processed");
    await warn();
    const ending = (await notificationTypes(context.userId)).filter((type) => type === "billing.trial_ending");
    expect(ending).toHaveLength(1);
  });

  it("ignores event types it has no use for but still records the receipt", { timeout: 60_000 }, async () => {
    const event = { id: stripeId("evt"), object: "event", type: "charge.refunded", created: nowSeconds(), data: { object: {} } };
    const outcome = await processStripeEvent(event as never, options());
    expect(outcome).toEqual({ status: "ignored", reason: "event type not used" });
    const receipts = await db.select().from(providerEvents).where(eq(providerEvents.providerEventId, event.id));
    expect(receipts).toHaveLength(1);
  });
});
