import { and, eq, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";

import { db } from "@/db";
import { subscriptions, users, workspaceMemberships, workspaces } from "@/db/schema";
import { normalizeEmail } from "@/lib/auth/email";
import { testRoutesEnabled } from "@/lib/security/production-guards";

/**
 * Test helper: reads the billing row for an owner's workspace so browser tests can sign
 * webhook events for the right Stripe customer. Requires EMAIL_TRANSPORT=test.
 */
export async function GET(request: Request) {
  if (!testRoutesEnabled()) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const email = new URL(request.url).searchParams.get("ownerEmail");
  if (!email) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  const [row] = await db
    .select({
      workspaceId: workspaces.id,
      customerId: subscriptions.providerCustomerId,
      subscriptionId: subscriptions.providerSubscriptionId,
      plan: subscriptions.plan,
      status: subscriptions.status,
    })
    .from(users)
    .innerJoin(
      workspaceMemberships,
      and(
        eq(workspaceMemberships.userId, users.id),
        eq(workspaceMemberships.status, "active"),
        eq(workspaceMemberships.role, "owner"),
      ),
    )
    .innerJoin(
      workspaces,
      and(eq(workspaces.id, workspaceMemberships.workspaceId), isNull(workspaces.deletedAt)),
    )
    .leftJoin(subscriptions, eq(subscriptions.workspaceId, workspaces.id))
    .where(eq(users.email, normalizeEmail(email)))
    .limit(1);

  return NextResponse.json({ state: row ?? null });
}
