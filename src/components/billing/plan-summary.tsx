import { StatusPill, type StatusTone } from "@/components/status-badge";
import { ManageBillingButton } from "@/components/billing/manage-billing-button";
import { describePlanPrice, formatBillingDate } from "@/lib/billing/format";
import type { BillingOverview } from "@/lib/billing/service";
import type { BillingState } from "@/lib/billing/subscription-state";

const STATE_TONE: Record<BillingState, StatusTone> = {
  free: "neutral",
  trialing: "ready",
  active: "positive",
  cancelling: "in-progress",
  past_due: "open",
  payment_lapsed: "open",
  trial_ended: "muted",
  cancelled: "muted",
};

type SummaryInput = Pick<
  BillingOverview,
  | "planName"
  | "state"
  | "stateLabel"
  | "resolution"
  | "canManage"
  | "canOpenPortal"
  | "hasSubscription"
  | "billingConfigured"
>;

function renewalLine(overview: SummaryInput): string | null {
  const { state, resolution } = overview;
  if (state === "trialing") {
    const ends = formatBillingDate(resolution.trialEndsAt);
    return ends ? `Trial ends on ${ends}` : null;
  }
  if (state === "active") {
    const next = formatBillingDate(resolution.currentPeriodEnd);
    return next ? `Renews on ${next}` : null;
  }
  if (state === "cancelling") {
    const ends = formatBillingDate(resolution.currentPeriodEnd);
    return ends ? `Ends on ${ends}` : null;
  }
  return null;
}

/** The current plan, its price, and the one thing an owner can do about it. */
export function PlanSummary({ overview }: { overview: SummaryInput }) {
  const price = describePlanPrice(overview.resolution.planId, overview.resolution.billingInterval);
  const renewal = renewalLine(overview);
  const paymentProblem = overview.state === "past_due" || overview.state === "payment_lapsed";

  return (
    <section
      aria-labelledby="current-plan-heading"
      className="grid gap-4 rounded-xl border border-border bg-card p-4 sm:p-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid gap-1">
          <h2 id="current-plan-heading" className="type-section-title">
            Your plan
          </h2>
          <p className="flex flex-wrap items-center gap-2">
            <span className="text-2xl font-semibold" data-testid="plan-name">
              {overview.planName}
            </span>
            <StatusPill tone={STATE_TONE[overview.state]}>{overview.stateLabel}</StatusPill>
          </p>
          <p className="type-supporting">
            {price}
            {renewal ? ` · ${renewal}` : ""}
          </p>
        </div>
        {overview.canManage && overview.canOpenPortal && overview.hasSubscription ? (
          <ManageBillingButton
            label={paymentProblem ? "Update payment details" : "Manage billing"}
            unavailableReason={
              overview.billingConfigured
                ? undefined
                : "Billing changes aren’t available right now. Please try again later."
            }
          />
        ) : null}
      </div>
      {!overview.canManage ? (
        <p className="type-supporting max-w-prose">
          Only the workspace owner can change the plan or payment details. You can see what the
          workspace is using below.
        </p>
      ) : null}
    </section>
  );
}
