import {
  PLAN_ENTITLEMENTS,
  PLAN_IDS,
  POOLED_USAGE_METRICS,
  type PlanId,
} from "@/lib/billing/plans";

/**
 * Future billing configuration. This file records product decisions for later
 * checkout and enforcement work. It does not collect payment or apply limits.
 */
export const BILLING_ENFORCEMENT_ENABLED = false;

export const SUBSCRIPTION_PLAN_VALUES = PLAN_IDS satisfies readonly PlanId[];

export const BILLING_PROVIDER = "stripe" as const;

export const DEFAULT_BILLING_CADENCE = "annual" as const;

export const UNPUBLISHED_POOLED_METRICS = (
  Object.entries(POOLED_USAGE_METRICS) as Array<
    [keyof typeof POOLED_USAGE_METRICS, (typeof POOLED_USAGE_METRICS)[keyof typeof POOLED_USAGE_METRICS]]
  >
)
  .filter(([, metric]) => metric.allowance.status === "undecided")
  .map(([id]) => id);

export function futurePlanCatalog() {
  return PLAN_IDS.map((id) => {
    const plan = PLAN_ENTITLEMENTS[id];
    return {
      id: plan.id,
      name: plan.name,
      monthlyPriceUsd: plan.monthlyPriceUsd,
      annualMonthlyPriceUsd: plan.annualMonthlyPriceUsd,
      annualTotalUsd: plan.annualTotalUsd,
      workspaceMembers: plan.workspaceMembers,
      activeReviewWebsites: plan.activeReviewWebsites,
      unlimitedGuestReviewers: plan.unlimitedGuestReviewers,
      unlimitedIssuesAndComments: plan.unlimitedIssuesAndComments,
      videoEvidence: plan.videoEvidence,
    };
  });
}
