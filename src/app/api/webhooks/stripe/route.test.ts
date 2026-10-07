import { eq } from "drizzle-orm";
import Stripe from "stripe";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { POST } from "@/app/api/webhooks/stripe/route";
import { db } from "@/db";
import { providerEvents, subscriptions } from "@/db/schema";
import { resolveWorkspaceEntitlement } from "@/lib/billing/effective-plan";
import { setEmailTransportForTests } from "@/lib/email";
import { TestEmailTransport } from "@/lib/email/test-transport";
import { TEST_PRICES, stripeId, subscriptionEvent } from "@/test/stripe-events";
import { createOwnerContext } from "@/test/workspace-fixtures";

const SECRET = "whsec_test_route_secret";

function signedRequest(payload: string, options: { secret?: string; header?: string | null } = {}) {
  const header =
    options.header === undefined
      ? Stripe.webhooks.generateTestHeaderString({ payload, secret: options.secret ?? SECRET })
      : options.header;
  return new Request("http://localhost/api/webhooks/stripe", {
    method: "POST",
    body: payload,
    headers: header ? { "stripe-signature": header, "content-type": "application/json" } : {},
  });
}

async function seedCustomer() {
  const context = await createOwnerContext("webhookroute");
  const customerId = stripeId("cus");
  await db.insert(subscriptions).values({
    workspaceId: context.workspaceId,
    provider: "stripe",
    providerCustomerId: customerId,
    plan: "free",
    status: "active",
  });
  return { context, customerId };
}

beforeEach(() => {
  setEmailTransportForTests(new TestEmailTransport());
  vi.stubEnv("STRIPE_WEBHOOK_SECRET", SECRET);
  vi.stubEnv("STRIPE_PRICE_STUDIO_MONTHLY", TEST_PRICES.studio.month);
  vi.stubEnv("STRIPE_PRICE_STUDIO_ANNUAL", TEST_PRICES.studio.year);
  vi.stubEnv("STRIPE_PRICE_AGENCY_MONTHLY", TEST_PRICES.agency.month);
  vi.stubEnv("STRIPE_PRICE_AGENCY_ANNUAL", TEST_PRICES.agency.year);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("POST /api/webhooks/stripe", () => {
  it("waits for a signing secret instead of trusting anyone", async () => {
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", "");
    const response = await POST(signedRequest("{}"));
    expect(response.status).toBe(503);
  });

  it("rejects a request with no signature", async () => {
    const response = await POST(signedRequest("{}", { header: null }));
    expect(response.status).toBe(400);
  });

  it("rejects a signature made with the wrong secret", async () => {
    const response = await POST(signedRequest("{}", { secret: "whsec_someone_else" }));
    expect(response.status).toBe(400);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(JSON.stringify(await response.json())).not.toContain(SECRET);
  });

  it("rejects a body that was changed after it was signed", async () => {
    const { context, customerId } = await seedCustomer();
    const original = JSON.stringify(
      subscriptionEvent({
        customerId,
        subscriptionId: stripeId("sub"),
        priceId: TEST_PRICES.studio.month,
        status: "active",
      }),
    );
    const header = Stripe.webhooks.generateTestHeaderString({ payload: original, secret: SECRET });
    const tampered = original.replace(TEST_PRICES.studio.month, TEST_PRICES.agency.month);
    const response = await POST(signedRequest(tampered, { header }));
    expect(response.status).toBe(400);
    expect((await resolveWorkspaceEntitlement(db, context.workspaceId)).planId).toBe("free");
  });

  it("accepts a correctly signed event, applies it once, and reports a repeat", { timeout: 60_000 }, async () => {
    const { context, customerId } = await seedCustomer();
    const event = subscriptionEvent({
      customerId,
      subscriptionId: stripeId("sub"),
      priceId: TEST_PRICES.agency.year,
      status: "active",
    });
    const payload = JSON.stringify(event);

    const first = await POST(signedRequest(payload));
    expect(first.status).toBe(200);
    expect(await first.json()).toEqual({ ok: true, status: "processed" });
    expect(await resolveWorkspaceEntitlement(db, context.workspaceId)).toMatchObject({
      planId: "agency",
      billingInterval: "year",
    });

    const second = await POST(signedRequest(payload));
    expect(second.status).toBe(200);
    expect(await second.json()).toEqual({ ok: true, status: "duplicate" });

    const receipts = await db.select().from(providerEvents).where(eq(providerEvents.providerEventId, event.id));
    expect(receipts).toHaveLength(1);
  });

  it("acknowledges events for other products without changing anything", { timeout: 60_000 }, async () => {
    const payload = JSON.stringify({
      id: stripeId("evt"),
      object: "event",
      type: "payment_intent.created",
      created: Math.floor(Date.now() / 1000),
      data: { object: { id: "pi_1" } },
    });
    const response = await POST(signedRequest(payload));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, status: "ignored" });
  });
});
