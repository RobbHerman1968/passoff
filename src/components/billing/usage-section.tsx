import { UsageMeter } from "@/components/billing/usage-meter";
import type { BillingOverview } from "@/lib/billing/service";

type UsageInput = Pick<BillingOverview, "planName" | "members" | "websites" | "video">;

/**
 * What the workspace is using against what its plan includes. Limits come from the plan
 * catalog through the entitlement service; this component only displays them.
 */
export function UsageSection({ overview }: { overview: UsageInput }) {
  const { members, websites, video } = overview;

  return (
    <section
      aria-labelledby="usage-heading"
      className="grid gap-5 rounded-xl border border-border bg-card p-4 sm:p-5"
    >
      <div className="grid gap-1">
        <h2 id="usage-heading" className="type-section-title">
          What your workspace is using
        </h2>
        <p className="type-supporting max-w-prose">
          Your {overview.planName} plan. Guest reviewers, issues, and comments are always free and
          unlimited. At a limit, only the thing that’s full pauses. Everything you’ve already made
          stays readable and editable.
        </p>
      </div>

      <UsageMeter
        testId="usage-members"
        label="Workspace members"
        used={members.seatsUsed}
        limit={members.limit}
        unit={{ one: "seat", many: "seats" }}
        window="People plus open invitations. Guests never use a seat"
      />
      <UsageMeter
        testId="usage-websites"
        label="Active review websites"
        used={websites.used}
        limit={websites.limit}
        window="Websites with a review that isn’t archived or closed"
        note={websites.limit === "unlimited" ? undefined : "Archiving a review frees its room"}
      />
      {video ? (
        <>
          <UsageMeter
            testId="usage-video-new"
            label="New video this month"
            used={video.newMinutesUsed}
            limit={video.newMinutesAllowed}
            unit={{ one: "minute", many: "minutes" }}
            window="Resets on the 1st of each month"
            note="Removing a clip doesn’t give minutes back"
          />
          <UsageMeter
            testId="usage-video-kept"
            label="Video kept right now"
            used={video.retainedMinutesUsed}
            limit={video.retainedMinutesAllowed}
            unit={{ one: "minute", many: "minutes" }}
            window="Clips stay while their issue is active, then 30 days after it closes"
            note="No automatic overage charges"
          />
        </>
      ) : null}
    </section>
  );
}
