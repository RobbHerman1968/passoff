import "server-only";

import { db } from "@/db";
import { getReviewWebsiteCapacity } from "@/lib/billing/review-websites";
import { notifyWorkspaceOwners } from "@/lib/billing/notify";
import { getMemberCapacity } from "@/lib/workspaces/capacity";

export type UsageLevel = "ok" | "warning" | "full";

export function usageLevel(used: number, limit: number | "unlimited"): UsageLevel {
  if (limit === "unlimited" || limit <= 0) return "ok";
  if (used >= limit) return "full";
  return used / limit >= 0.8 ? "warning" : "ok";
}

/**
 * Tells the owner when the workspace reaches 80% or 100% of a limit. Each plan and level
 * produces one notice, so adding a fourth review does not repeat the third one's warning.
 * Reading and written feedback are never affected; this is only a heads-up.
 */
export type UsageKey = "review_websites" | "members";

export async function notifyUsageThresholds(
  workspaceId: string,
  only?: readonly UsageKey[],
): Promise<void> {
  const [websites, members] = await Promise.all([
    getReviewWebsiteCapacity(db, workspaceId),
    getMemberCapacity(workspaceId),
  ]);

  const checks: {
    key: UsageKey;
    label: string;
    used: number;
    limit: number | "unlimited";
    planId: string;
    planName: string;
  }[] = [
    {
      key: "review_websites",
      label: "Active review websites",
      used: websites.used,
      limit: websites.limit,
      planId: websites.planId,
      planName: websites.planName,
    },
    {
      key: "members",
      label: "Workspace members",
      used: members.seatsUsed,
      limit: members.limit,
      planId: members.planId,
      planName: members.planName,
    },
  ];

  for (const check of checks) {
    if (only && !only.includes(check.key)) continue;
    // A one-person workspace is always "full" on seats; that is not news worth an alert.
    if (check.key === "members" && check.limit === 1) continue;
    const level = usageLevel(check.used, check.limit);
    if (level === "ok" || check.limit === "unlimited") continue;
    await notifyWorkspaceOwners({
      workspaceId,
      type: "billing.usage_warning",
      dedupeKey: `billing.usage_warning:${workspaceId}:${check.key}:${check.planId}:${level}`,
      data: {
        planName: check.planName,
        usageLabel: check.label,
        usageUsed: check.used,
        usageLimit: check.limit,
      },
    });
  }
}
