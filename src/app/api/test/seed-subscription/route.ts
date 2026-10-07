import { and, eq, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";

import { db } from "@/db";
import { subscriptions, users, workspaceMemberships, workspaces } from "@/db/schema";
import { normalizeEmail } from "@/lib/auth/email";
import { PLAN_ENTITLEMENTS, type PlanId } from "@/lib/billing/plans";
import { testRoutesEnabled } from "@/lib/security/production-guards";

/**
 * Test helper: give the owner's workspace an active plan so invitation tests have seats.
 * No payment provider is involved. Requires EMAIL_TRANSPORT=test.
 */
export async function POST(request: Request) {
  if (!testRoutesEnabled()) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = (await request.json().catch(() => null)) as {
    ownerEmail?: string;
    plan?: string;
  } | null;
  const ownerEmail = typeof body?.ownerEmail === "string" ? normalizeEmail(body.ownerEmail) : "";
  const plan = typeof body?.plan === "string" ? body.plan : "studio";
  if (!ownerEmail || !Object.hasOwn(PLAN_ENTITLEMENTS, plan)) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const [owner] = await db
    .select({ workspaceId: workspaces.id })
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
    .where(eq(users.email, ownerEmail))
    .limit(1);
  if (!owner) {
    return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
  }

  await db
    .insert(subscriptions)
    .values({
      workspaceId: owner.workspaceId,
      provider: "test",
      providerCustomerId: `test-customer-${owner.workspaceId}`,
      plan: plan as PlanId,
      status: "active",
    })
    .onConflictDoUpdate({
      target: subscriptions.workspaceId,
      set: { plan: plan as PlanId, status: "active", updatedAt: new Date() },
    });

  return NextResponse.json({ ok: true });
}
