import "server-only";

import { eq } from "drizzle-orm";

import type { db } from "@/db";
import { subscriptions } from "@/db/schema";
import type { PlanId } from "@/lib/billing/plans";
import {
  resolveEntitlement,
  type EntitlementResolution,
  type StoredSubscriptionStatus,
  type SubscriptionSnapshot,
} from "@/lib/billing/subscription-state";

type Executor = Pick<typeof db, "select">;

export type StoredSubscription = SubscriptionSnapshot & {
  id: string;
  workspaceId: string;
  provider: string;
  providerCustomerId: string;
  providerSubscriptionId: string | null;
  providerPriceId: string | null;
  cancelledAt: Date | null;
  currentPeriodStart: Date | null;
  providerEventAt: Date | null;
};

export async function loadSubscription(
  executor: Executor,
  workspaceId: string,
): Promise<StoredSubscription | null> {
  const [row] = await executor
    .select({
      id: subscriptions.id,
      workspaceId: subscriptions.workspaceId,
      provider: subscriptions.provider,
      providerCustomerId: subscriptions.providerCustomerId,
      providerSubscriptionId: subscriptions.providerSubscriptionId,
      providerPriceId: subscriptions.providerPriceId,
      plan: subscriptions.plan,
      status: subscriptions.status,
      billingInterval: subscriptions.billingInterval,
      currentPeriodStart: subscriptions.currentPeriodStart,
      currentPeriodEnd: subscriptions.currentPeriodEnd,
      cancelAtPeriodEnd: subscriptions.cancelAtPeriodEnd,
      trialStartedAt: subscriptions.trialStartedAt,
      trialEndsAt: subscriptions.trialEndsAt,
      pastDueSince: subscriptions.pastDueSince,
      cancelledAt: subscriptions.cancelledAt,
      providerEventAt: subscriptions.providerEventAt,
    })
    .from(subscriptions)
    .where(eq(subscriptions.workspaceId, workspaceId))
    .limit(1);
  if (!row) return null;
  return { ...row, status: row.status as StoredSubscriptionStatus };
}

/** The one place that answers "what does this workspace get right now?" */
export async function resolveWorkspaceEntitlement(
  executor: Executor,
  workspaceId: string,
  now: Date = new Date(),
): Promise<EntitlementResolution> {
  return resolveEntitlement(await loadSubscription(executor, workspaceId), now);
}

export async function resolveWorkspacePlanId(
  executor: Executor,
  workspaceId: string,
  now: Date = new Date(),
): Promise<PlanId> {
  return (await resolveWorkspaceEntitlement(executor, workspaceId, now)).planId;
}
