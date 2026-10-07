import {
  PLAN_ENTITLEMENTS,
  formatDurationMinutes,
  formatUsd,
  type PlanId,
} from "@/lib/billing/plans";

/**
 * Plain-language copy built from the plan catalog. Prices, seat counts, and website limits
 * are never typed into components: they are read from src/lib/billing/plans.ts here.
 */
export function describeMembers(planId: PlanId): string {
  const count = PLAN_ENTITLEMENTS[planId].workspaceMembers;
  return `${count} workspace ${count === 1 ? "member" : "members"}`;
}

export function describeReviewWebsites(planId: PlanId): string {
  const limit = PLAN_ENTITLEMENTS[planId].activeReviewWebsites;
  if (limit === "unlimited") return "Unlimited active review websites";
  return `${limit} active review ${limit === 1 ? "website" : "websites"}`;
}

/** "$29" style monthly figure for a schedule. */
export function monthlyPriceLabel(planId: PlanId, schedule: "month" | "year"): string {
  const plan = PLAN_ENTITLEMENTS[planId];
  return formatUsd(schedule === "year" ? plan.annualMonthlyPriceUsd : plan.monthlyPriceUsd);
}

/** "per month, billed $348 yearly" or "per month, billed monthly". */
export function billingCadenceLabel(planId: PlanId, schedule: "month" | "year"): string {
  const plan = PLAN_ENTITLEMENTS[planId];
  if (plan.monthlyPriceUsd === 0) return "Free for as long as you need it";
  return schedule === "year"
    ? `per month, billed ${formatUsd(plan.annualTotalUsd)} yearly`
    : "per month, billed monthly";
}

/** A one-line price for the billing page, e.g. "$89 a month, billed $1,068 yearly". */
export function describePlanPrice(planId: PlanId, schedule: "month" | "year" | null): string {
  const plan = PLAN_ENTITLEMENTS[planId];
  if (plan.monthlyPriceUsd === 0) return "Free";
  if (schedule === "year") {
    return `${formatUsd(plan.annualMonthlyPriceUsd)} a month, billed ${formatUsd(plan.annualTotalUsd)} yearly`;
  }
  return `${formatUsd(plan.monthlyPriceUsd)} a month, billed monthly`;
}

/** A calendar date fixed to UTC so the page and emails read the same everywhere. */
export function formatBillingDate(date: Date | string | null | undefined): string | null {
  if (!date) return null;
  const value = typeof date === "string" ? new Date(date) : date;
  if (Number.isNaN(value.getTime())) return null;
  return value.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

/** "30 min new video / month · 1 hour retained". Read from the video-evidence policy. */
export function describeVideoAllowance(planId: PlanId): string {
  const policy = PLAN_ENTITLEMENTS[planId].videoEvidence;
  if (policy.status !== "approved") return "Video evidence limits are not published yet";
  return `${formatDurationMinutes(policy.limits.newUploadMinutesPerCalendarMonth)} new video / month · ${formatDurationMinutes(policy.limits.retainedMinutes)} retained`;
}
