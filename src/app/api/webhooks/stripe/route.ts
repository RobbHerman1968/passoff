import { NextResponse } from "next/server";
import Stripe from "stripe";

import { readBillingEnvironment } from "@/lib/billing/stripe-config";
import { processStripeEvent } from "@/lib/billing/webhook-service";
import { logOps, safeErrorSummary } from "@/lib/ops/diagnostics";

export const runtime = "nodejs";

function noStoreJson(body: Record<string, unknown>, status: number) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

/**
 * Stripe's webhook is the only thing that changes a workspace's plan. The signature is
 * checked against the exact bytes Stripe sent, so the body is read as text and never parsed
 * before it is verified. Errors never echo the payload or the secret.
 */
export async function POST(request: Request) {
  const { webhookSecret } = readBillingEnvironment();
  if (!webhookSecret) {
    // Not set up yet. Stripe retries, so nothing is lost once the secret is added.
    return noStoreJson({ ok: false }, 503);
  }

  const signature = request.headers.get("stripe-signature");
  if (!signature) return noStoreJson({ ok: false }, 400);

  const rawBody = await request.text();

  let event: Stripe.Event;
  try {
    event = Stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch {
    return noStoreJson({ ok: false }, 400);
  }

  try {
    const outcome = await processStripeEvent(event);
    return noStoreJson({ ok: true, status: outcome.status }, 200);
  } catch (error) {
    // The receipt rolled back with the change, so Stripe's retry is handled from the start.
    logOps("error", "billing.webhook_failed", {
      eventType: event.type,
      ...safeErrorSummary(error),
    });
    return noStoreJson({ ok: false }, 500);
  }
}
