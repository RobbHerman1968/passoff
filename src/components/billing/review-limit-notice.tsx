import { AlertTriangle, Info } from "lucide-react";
import Link from "next/link";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import type { ReviewWebsiteCapacity } from "@/lib/billing/review-websites";
import { nextPlanUp, planName } from "@/lib/billing/subscription-state";

/**
 * Shown above a project's reviews when the workspace is close to, at, or over its plan's
 * active review website limit. It only appears when there is something to do, and it
 * never blocks reading, comments, or issues.
 */
export function ReviewLimitNotice({
  capacity,
  isOwner,
}: {
  capacity: ReviewWebsiteCapacity;
  isOwner: boolean;
}) {
  if (capacity.limit === "unlimited") return null;
  if (!capacity.nearLimit && !capacity.atLimit && !capacity.overLimit) return null;

  const limit = capacity.limit;
  const sites = (count: number) => `${count} active review ${count === 1 ? "website" : "websites"}`;
  const next = nextPlanUp(capacity.planId);

  const fix = isOwner ? (
    <>
      Archive a review you’re finished with
      {next ? (
        <>
          , or{" "}
          <Link href="/settings/billing" className="font-medium underline underline-offset-4">
            move to {planName(next)} on the Billing page
          </Link>
        </>
      ) : null}
      .
    </>
  ) : (
    <>
      Archive a review you’re finished with
      {next ? `, or ask your workspace owner to move to ${planName(next)}` : ""}.
    </>
  );

  if (capacity.overLimit || capacity.atLimit) {
    return (
      <Alert variant="warning" data-testid="review-limit-notice">
        <AlertTriangle aria-hidden="true" />
        <AlertTitle>
          {capacity.overLimit
            ? `Your workspace is over its plan: ${sites(capacity.used)}`
            : `You’ve reached your plan’s limit of ${sites(limit)}`}
        </AlertTitle>
        <AlertDescription>
          Adding another review is paused. Everything you have stays open, and you can keep
          reading and writing feedback. {fix}
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <Alert variant="info" data-testid="review-limit-notice">
      <Info aria-hidden="true" />
      <AlertTitle>
        You’re using {capacity.used} of {sites(limit)}
      </AlertTitle>
      <AlertDescription>
        Room for {capacity.remaining} more. {fix}
      </AlertDescription>
    </Alert>
  );
}
