import "server-only";

import { and, asc, eq, gt, lte } from "drizzle-orm";

import { db } from "@/db";
import { subscriptions } from "@/db/schema";
import { notifyWorkspaceOwners } from "@/lib/billing/notify";
import { PLAN_ENTITLEMENTS } from "@/lib/billing/plans";
import { loadSubscription } from "@/lib/billing/effective-plan";
import { PAST_DUE_GRACE_DAYS, resolveEntitlement } from "@/lib/billing/subscription-state";
import { notifyUsageThresholds } from "@/lib/billing/usage-notices";

/**
 * Tells owners when a payment problem has gone on long enough that the workspace is using
 * Free limits. Nothing is deleted or locked: this only sends a notice and is safe to run
 * again, because each lapse produces one notice.
 */
export async function notifyLapsedWorkspaces(
  now: Date = new Date(),
  options: { workspaceId?: string; batchSize?: number; maxBatches?: number } = {},
): Promise<{ checked: number; notified: number }> {
  const batchSize = options.batchSize ?? 100;
  const maxBatches = options.maxBatches ?? 20;
  // Only rows whose grace period has already run out can be lapsed.
  const lapsedBefore = new Date(now.getTime() - PAST_DUE_GRACE_DAYS * 24 * 60 * 60 * 1000);

  let checked = 0;
  let notified = 0;
  let after: string | null = null;

  for (let batch = 0; batch < maxBatches; batch += 1) {
    const candidates: { id: string; workspaceId: string }[] = await db
      .select({ id: subscriptions.id, workspaceId: subscriptions.workspaceId })
      .from(subscriptions)
      .where(
        and(
          eq(subscriptions.status, "past_due"),
          lte(subscriptions.pastDueSince, lapsedBefore),
          options.workspaceId ? eq(subscriptions.workspaceId, options.workspaceId) : undefined,
          after ? gt(subscriptions.id, after) : undefined,
        ),
      )
      .orderBy(asc(subscriptions.id))
      .limit(batchSize);
    if (candidates.length === 0) break;

    for (const candidate of candidates) {
      checked += 1;
      const subscription = await loadSubscription(db, candidate.workspaceId);
      if (!subscription?.pastDueSince) continue;
      const resolution = resolveEntitlement(subscription, now);
      if (resolution.state !== "payment_lapsed") continue;

      const result = await notifyWorkspaceOwners({
        workspaceId: candidate.workspaceId,
        type: "billing.payment_lapsed",
        dedupeKey: `billing.payment_lapsed:${candidate.workspaceId}:${subscription.pastDueSince.toISOString()}`,
        data: { planName: PLAN_ENTITLEMENTS[resolution.purchasedPlanId ?? "free"].name },
      });
      if (result.created > 0) {
        notified += 1;
        await notifyUsageThresholds(candidate.workspaceId).catch(() => undefined);
      }
    }
    after = candidates[candidates.length - 1].id;
    if (candidates.length < batchSize) break;
  }
  return { checked, notified };
}
