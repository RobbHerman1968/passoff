import { AlertTriangle, Clock3, Info } from "lucide-react";
import type * as React from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { formatBillingDate } from "@/lib/billing/format";
import type { BillingOverview } from "@/lib/billing/service";

type NoticeInput = Pick<
  BillingOverview,
  "state" | "planName" | "canManage" | "resolution" | "over" | "members" | "websites" | "trial"
> & { checkout?: string | null };

function ownerStep(canManage: boolean, owner: string, member: string) {
  return canManage ? owner : member;
}

function titleCase(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

/**
 * Plain-language status for the billing page. Every message says what happened, what still
 * works (everything), and who can fix it. Color never carries the meaning on its own.
 */
export function BillingNotices({ overview }: { overview: NoticeInput }) {
  const { state, canManage, resolution } = overview;
  const purchased = resolution.purchasedPlanId ? titleCase(resolution.purchasedPlanId) : "paid";
  const notices: React.ReactNode[] = [];

  if (overview.checkout === "success") {
    const paid = state === "trialing" || state === "active" || state === "cancelling";
    notices.push(
      paid ? (
        <Alert key="checkout" variant="success" role="status">
          <AlertTitle>You’re on the {overview.planName} plan.</AlertTitle>
          <AlertDescription>Your new limits are active.</AlertDescription>
        </Alert>
      ) : (
        <Alert key="checkout" variant="info" role="status">
          <Clock3 aria-hidden="true" />
          <AlertTitle>Waiting for confirmation from our payment provider</AlertTitle>
          <AlertDescription>
            This usually takes under a minute. Your plan updates here as soon as it’s confirmed.
            Refresh this page to check. You won’t be charged twice.
          </AlertDescription>
        </Alert>
      ),
    );
  } else if (overview.checkout === "cancelled") {
    notices.push(
      <Alert key="checkout" variant="info" role="status">
        <Info aria-hidden="true" />
        <AlertTitle>No changes were made</AlertTitle>
        <AlertDescription>You left the payment page, so your plan stays as it was.</AlertDescription>
      </Alert>,
    );
  }

  if (state === "past_due") {
    const until = formatBillingDate(resolution.graceEndsAt);
    notices.push(
      <Alert key="state" variant="warning">
        <AlertTriangle aria-hidden="true" />
        <AlertTitle>We couldn’t take your latest payment</AlertTitle>
        <AlertDescription>
          {ownerStep(
            canManage,
            `Update your payment details${until ? ` by ${until}` : ""} to keep the ${purchased} plan. Nothing has been removed, and everyone can keep working.`,
            `Ask your workspace owner to update the payment details${until ? ` by ${until}` : ""} to keep the ${purchased} plan. Nothing has been removed, and everyone can keep working.`,
          )}
        </AlertDescription>
      </Alert>,
    );
  } else if (state === "payment_lapsed") {
    notices.push(
      <Alert key="state" variant="warning">
        <AlertTriangle aria-hidden="true" />
        <AlertTitle>This workspace is using Free limits</AlertTitle>
        <AlertDescription>
          We couldn’t collect payment in time, so the {purchased} plan is paused. All of your
          projects, reviews, issues, and video are kept.{" "}
          {ownerStep(
            canManage,
            "Update your payment details to restore the plan.",
            "Ask your workspace owner to update the payment details to restore the plan.",
          )}
        </AlertDescription>
      </Alert>,
    );
  } else if (state === "trialing") {
    const ends = formatBillingDate(resolution.trialEndsAt);
    const left = overview.trial.daysLeft;
    notices.push(
      <Alert key="state" variant="info" role="status">
        <Clock3 aria-hidden="true" />
        <AlertTitle>
          Your {overview.planName} trial {ends ? `ends on ${ends}` : "is running"}
          {typeof left === "number" ? ` (${left} ${left === 1 ? "day" : "days"} left)` : ""}
        </AlertTitle>
        <AlertDescription>
          {ownerStep(
            canManage,
            "Add payment details with “Manage billing” to keep the plan. If you don’t, the workspace moves to Free and all of your work stays safe.",
            "If the owner doesn’t add payment details, the workspace moves to Free and all of your work stays safe.",
          )}
        </AlertDescription>
      </Alert>,
    );
  } else if (state === "cancelling") {
    const ends = formatBillingDate(resolution.currentPeriodEnd);
    notices.push(
      <Alert key="state" variant="info" role="status">
        <Info aria-hidden="true" />
        <AlertTitle>
          The {overview.planName} plan ends{ends ? ` on ${ends}` : " at the end of this period"}
        </AlertTitle>
        <AlertDescription>
          You keep every feature until then. After that the workspace moves to Free and all of
          your work stays safe.
        </AlertDescription>
      </Alert>,
    );
  } else if (state === "trial_ended" || state === "cancelled") {
    notices.push(
      <Alert key="state" variant="info" role="status">
        <Info aria-hidden="true" />
        <AlertTitle>
          {state === "trial_ended" ? "Your trial has ended" : `Your ${purchased} plan has ended`}
        </AlertTitle>
        <AlertDescription>
          This workspace is on Free. Your projects, reviews, issues, and video are all still here.
          {canManage
            ? " Choose a plan any time to get more room."
            : " Your workspace owner can choose a plan to get more room."}
        </AlertDescription>
      </Alert>,
    );
  }

  const overItems: string[] = [];
  if (overview.over.websites) {
    overItems.push(
      `${overview.websites.used} active review websites (your plan includes ${overview.websites.limit})`,
    );
  }
  if (overview.over.members) {
    overItems.push(
      `${overview.members.seatsUsed} people including open invitations (your plan includes ${overview.members.limit})`,
    );
  }
  if (overItems.length > 0) {
    notices.push(
      <Alert key="over" variant="warning">
        <AlertTriangle aria-hidden="true" />
        <AlertTitle>You’re over what the {overview.planName} plan includes</AlertTitle>
        <AlertDescription>
          Using {overItems.join(" and ")}. Nothing was removed and everyone can keep working. You
          just can’t add more until you’re back within the plan.{" "}
          {ownerStep(
            canManage,
            "Archive finished reviews, remove people you no longer work with, or choose a larger plan.",
            "Ask your workspace owner to archive finished reviews, free up seats, or choose a larger plan.",
          )}
        </AlertDescription>
      </Alert>,
    );
  }

  if (notices.length === 0) return null;
  return <div className="grid gap-3">{notices}</div>;
}
