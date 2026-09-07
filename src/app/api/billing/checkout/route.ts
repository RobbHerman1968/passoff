import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import Stripe from "stripe";

import { authzResponse, requireActiveWorkspaceMembership } from "@/lib/auth/authorization";
import { db } from "@/db";
import { organizations } from "@/db/schema";
import { getOrganizationEntitlements } from "@/lib/rooms/entitlements";
import { publicPricingPlans } from "@/lib/pricing";
import { getSiteUrl } from "@/lib/site";

export const runtime = "nodejs";

const PURCHASABLE = new Set(["solo"]);

export async function GET() {
  try {
    const scope = await requireActiveWorkspaceMembership();
    const entitlements = await getOrganizationEntitlements(scope.organizationId);
    return NextResponse.json({ entitlements, plans: publicPricingPlans });
  } catch (error) {
    const authz = authzResponse(error);
    if (authz) return authz;
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to load billing." },
      { status: 400 },
    );
  }
}

/** Creates a Stripe Checkout session. Never activates paid plans manually outside development. */
export async function POST(request: Request) {
  try {
    const scope = await requireActiveWorkspaceMembership();
    const body = (await request.json()) as { planId?: unknown; interval?: unknown };
    const planId = typeof body.planId === "string" ? body.planId : "";
    const interval = body.interval === "annual" ? "annual" : "monthly";

    if (!PURCHASABLE.has(planId)) {
      return NextResponse.json(
        { error: "Only the Solo plan is available for purchase in this release." },
        { status: 400 },
      );
    }

    const stripeKey = process.env.STRIPE_SECRET_KEY;
    if (!stripeKey) {
      if (process.env.NODE_ENV === "production" || process.env.VERCEL === "1") {
        return NextResponse.json(
          { error: "Stripe is not configured. Set STRIPE_SECRET_KEY." },
          { status: 503 },
        );
      }
      return NextResponse.json(
        {
          error:
            "Stripe is not configured for local development. Set STRIPE_SECRET_KEY to test checkout, or use the Trial plan.",
        },
        { status: 501 },
      );
    }

    const priceEnvKey =
      interval === "annual" ? "STRIPE_PRICE_SOLO_ANNUAL" : "STRIPE_PRICE_SOLO_MONTHLY";
    const priceId = process.env[priceEnvKey];
    if (!priceId) {
      return NextResponse.json({ error: `Missing ${priceEnvKey} in environment.` }, { status: 400 });
    }

    const org = (
      await db.select().from(organizations).where(eq(organizations.id, scope.organizationId)).limit(1)
    )[0];

    const stripe = new Stripe(stripeKey);
    const base = getSiteUrl();
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      success_url: `${base}/dashboard?billing=success`,
      cancel_url: `${base}/pricing?billing=cancel`,
      client_reference_id: scope.organizationId,
      customer_email: scope.userEmail,
      line_items: [{ price: priceId, quantity: 1 }],
      metadata: {
        organizationId: scope.organizationId,
        planId: "solo",
        ...(org ? { organizationSlug: org.slug } : {}),
      },
      subscription_data: {
        metadata: {
          organizationId: scope.organizationId,
          planId: "solo",
        },
      },
    });

    if (!session.url) {
      throw new Error("Stripe checkout failed to return a URL.");
    }
    return NextResponse.json({ url: session.url, id: session.id });
  } catch (error) {
    const authz = authzResponse(error);
    if (authz) return authz;
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Billing request failed." },
      { status: 400 },
    );
  }
}
