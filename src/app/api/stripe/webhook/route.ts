import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import Stripe from "stripe";

import { db } from "@/db";
import { stripeWebhookEvents } from "@/db/schema";
import { upsertSubscriptionMirror } from "@/lib/rooms/entitlements";
import { logInfo, logWarn } from "@/lib/logging";

export const runtime = "nodejs";

function mapStripeStatus(status: string) {
  return status;
}

function planFromMetadata(metadata: Stripe.Metadata | null | undefined): string {
  const plan = metadata?.planId;
  if (plan === "solo") return "solo";
  // First release: only Solo is purchasable.
  return "solo";
}

async function alreadyProcessed(eventId: string) {
  const existing = (
    await db
      .select({ id: stripeWebhookEvents.id })
      .from(stripeWebhookEvents)
      .where(eq(stripeWebhookEvents.stripeEventId, eventId))
      .limit(1)
  )[0];
  return Boolean(existing);
}

async function markProcessed(eventId: string, type: string) {
  await db
    .insert(stripeWebhookEvents)
    .values({ stripeEventId: eventId, type })
    .onConflictDoNothing();
}

export async function POST(request: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (!secret || !stripeKey) {
    return NextResponse.json({ error: "Stripe webhooks are not configured." }, { status: 501 });
  }

  const stripe = new Stripe(stripeKey);
  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing signature." }, { status: 400 });
  }

  const raw = await request.text();
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(raw, signature, secret);
  } catch (error) {
    logWarn("stripe.webhook_signature_failed", {
      error: error instanceof Error ? error.message : "invalid",
    });
    return NextResponse.json({ error: "Invalid signature." }, { status: 400 });
  }

  if (await alreadyProcessed(event.id)) {
    logInfo("stripe.webhook_duplicate", { id: event.id, type: event.type });
    return NextResponse.json({ received: true, duplicate: true });
  }

  try {
    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      const organizationId =
        session.metadata?.organizationId ||
        (typeof session.client_reference_id === "string" ? session.client_reference_id : "");
      if (organizationId) {
        let periodStart: Date | null = null;
        let periodEnd: Date | null = null;
        let status = "active";
        let subscriptionId =
          typeof session.subscription === "string" ? session.subscription : null;

        if (subscriptionId) {
          const sub = await stripe.subscriptions.retrieve(subscriptionId);
          status = mapStripeStatus(sub.status);
          periodStart = new Date(sub.items.data[0]?.current_period_start
            ? sub.items.data[0].current_period_start * 1000
            : (sub as unknown as { current_period_start?: number }).current_period_start
              ? ((sub as unknown as { current_period_start: number }).current_period_start * 1000)
              : Date.now());
          periodEnd = new Date(
            sub.items.data[0]?.current_period_end
              ? sub.items.data[0].current_period_end * 1000
              : (sub as unknown as { current_period_end?: number }).current_period_end
                ? ((sub as unknown as { current_period_end: number }).current_period_end * 1000)
                : Date.now() + 30 * 24 * 60 * 60 * 1000,
          );
          subscriptionId = sub.id;
        }

        await upsertSubscriptionMirror({
          organizationId,
          provider: "stripe",
          providerCustomerId: typeof session.customer === "string" ? session.customer : null,
          providerSubscriptionId: subscriptionId,
          plan: planFromMetadata(session.metadata),
          status,
          currentPeriodStart: periodStart,
          currentPeriodEnd: periodEnd,
        });
      }
    }

    if (
      event.type === "customer.subscription.updated" ||
      event.type === "customer.subscription.created" ||
      event.type === "customer.subscription.deleted"
    ) {
      const sub = event.data.object as Stripe.Subscription;
      const organizationId = sub.metadata?.organizationId;
      if (organizationId) {
        const periodStart = new Date(
          ((sub as unknown as { current_period_start?: number }).current_period_start ||
            sub.items.data[0]?.current_period_start ||
            0) * 1000,
        );
        const periodEnd = new Date(
          ((sub as unknown as { current_period_end?: number }).current_period_end ||
            sub.items.data[0]?.current_period_end ||
            0) * 1000,
        );

        if (event.type === "customer.subscription.deleted") {
          await upsertSubscriptionMirror({
            organizationId,
            provider: "stripe",
            providerCustomerId: typeof sub.customer === "string" ? sub.customer : null,
            providerSubscriptionId: sub.id,
            plan: planFromMetadata(sub.metadata),
            status: "canceled",
            currentPeriodStart: periodStart,
            currentPeriodEnd: periodEnd,
            cancelAtPeriodEnd: false,
          });
        } else {
          await upsertSubscriptionMirror({
            organizationId,
            provider: "stripe",
            providerCustomerId: typeof sub.customer === "string" ? sub.customer : null,
            providerSubscriptionId: sub.id,
            plan: planFromMetadata(sub.metadata),
            status: mapStripeStatus(sub.status),
            currentPeriodStart: periodStart,
            currentPeriodEnd: periodEnd,
            cancelAtPeriodEnd: Boolean(sub.cancel_at_period_end),
          });
        }
      }
    }

    if (event.type === "invoice.payment_failed") {
      const invoice = event.data.object as Stripe.Invoice;
      const subscriptionRef = (invoice as unknown as { subscription?: string | { id: string } | null })
        .subscription;
      const subscriptionId =
        typeof subscriptionRef === "string"
          ? subscriptionRef
          : subscriptionRef && typeof subscriptionRef === "object"
            ? subscriptionRef.id
            : null;
      if (subscriptionId) {
        const sub = await stripe.subscriptions.retrieve(subscriptionId);
        const organizationId = sub.metadata?.organizationId;
        if (organizationId) {
          await upsertSubscriptionMirror({
            organizationId,
            provider: "stripe",
            providerCustomerId: typeof sub.customer === "string" ? sub.customer : null,
            providerSubscriptionId: sub.id,
            plan: planFromMetadata(sub.metadata),
            status: "past_due",
            cancelAtPeriodEnd: Boolean(sub.cancel_at_period_end),
          });
        }
      }
    }

    await markProcessed(event.id, event.type);
    logInfo("stripe.webhook_processed", { id: event.id, type: event.type });
    return NextResponse.json({ received: true });
  } catch (error) {
    logWarn("stripe.webhook_failed", {
      id: event.id,
      error: error instanceof Error ? error.message : "unknown",
    });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Webhook failed." },
      { status: 400 },
    );
  }
}
