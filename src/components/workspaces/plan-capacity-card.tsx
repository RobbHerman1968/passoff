import Link from "next/link";

import { formatUsd, PLAN_ENTITLEMENTS } from "@/lib/billing/plans";
import type { MemberCapacity } from "@/lib/workspaces/capacity";
import { cn } from "@/lib/utils";

export type PlanCapacityCardProps = {
  planName: string;
  capacity: MemberCapacity;
  activeReviewWebsites: number | "unlimited";
  canManageMembers: boolean;
};

/**
 * What the workspace plan includes and how many seats are taken. Plan changes happen on the
 * Billing page, which this card links to.
 */
export function PlanCapacityCard({
  planName,
  capacity,
  activeReviewWebsites,
  canManageMembers,
}: PlanCapacityCardProps) {
  const percent = Math.min(100, Math.round((capacity.seatsUsed / Math.max(1, capacity.limit)) * 100));
  const monthly = PLAN_ENTITLEMENTS[capacity.planId].monthlyPriceUsd;

  return (
    <section
      aria-labelledby="plan-capacity-heading"
      className="grid gap-4 rounded-xl border border-border bg-card p-4 sm:p-5"
    >
      <div className="grid gap-1">
        <h2 id="plan-capacity-heading" className="type-section-title">
          Plan and seats
        </h2>
        <p className="type-supporting">
          {planName} plan{monthly > 0 ? ` · ${formatUsd(monthly)} a month` : ""}
        </p>
      </div>

      <div className="grid gap-2">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="text-sm font-medium">People in this workspace</p>
          <p className="text-sm tabular-nums" data-testid="seat-count">
            {capacity.seatsUsed} of {capacity.limit} {capacity.limit === 1 ? "seat" : "seats"} used
          </p>
        </div>
        <div aria-hidden="true" className="h-2 overflow-hidden rounded-full bg-muted">
          <div
            className={cn(
              "h-full rounded-full",
              capacity.atCapacity ? "bg-destructive" : capacity.nearCapacity ? "bg-status-in-progress" : "bg-primary",
            )}
            style={{ width: `${percent}%` }}
          />
        </div>
        <p className="type-supporting">
          {capacity.activeMembers} {capacity.activeMembers === 1 ? "person has" : "people have"} joined
          {capacity.pendingInvitations > 0
            ? `, and ${capacity.pendingInvitations} open ${capacity.pendingInvitations === 1 ? "invitation holds" : "invitations hold"} a seat`
            : ""}
          . Guest reviewers are free and never use a seat.
        </p>
      </div>

      {capacity.atCapacity ? (
        <p role="status" className="rounded-lg border border-input bg-muted/50 p-3 text-sm">
          <strong className="font-semibold">All seats are in use.</strong>{" "}
          {canManageMembers
            ? "Remove someone or cancel an open invitation to make room, or choose a larger plan."
            : "Ask your workspace owner to make room or choose a larger plan."}{" "}
          <Link href="/settings/billing" className="font-medium underline underline-offset-4">
            See plan and usage
          </Link>
        </p>
      ) : capacity.nearCapacity ? (
        <p role="status" className="rounded-lg border border-input bg-muted/50 p-3 text-sm">
          <strong className="font-semibold">Almost full.</strong> {capacity.seatsRemaining}{" "}
          {capacity.seatsRemaining === 1 ? "seat is" : "seats are"} left on your plan.
        </p>
      ) : null}

      <dl className="grid gap-1 text-sm">
        <div className="flex flex-wrap justify-between gap-2">
          <dt className="text-muted-foreground">Websites under review</dt>
          <dd className="tabular-nums">
            {activeReviewWebsites === "unlimited" ? "Unlimited" : `Up to ${activeReviewWebsites}`}
          </dd>
        </div>
      </dl>
    </section>
  );
}
