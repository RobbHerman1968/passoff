"use client";

import { Check } from "lucide-react";
import * as React from "react";

import {
  startCheckoutAction,
  type BillingActionState,
} from "@/app/(app)/settings/billing/actions";
import { FormAlert } from "@/components/auth/form-alert";
import { NetworkGate } from "@/components/auth/network-aware-form";
import { Button } from "@/components/ui/button";
import {
  billingCadenceLabel,
  describeMembers,
  describeReviewWebsites,
  describeVideoAllowance,
  monthlyPriceLabel,
} from "@/lib/billing/format";
import { AGENCY_TRIAL_DAYS, ANNUAL_SAVINGS_PERCENT, PLAN_ENTITLEMENTS } from "@/lib/billing/plans";
import { cn } from "@/lib/utils";

const PICKABLE = ["studio", "agency"] as const;
type Schedule = "month" | "year";

const idle: BillingActionState = { status: "idle" };

/**
 * Lets an owner choose a paid plan. Choosing sends them to a secure Stripe page to confirm;
 * Passoff never asks for card details. Every price and limit comes from the plan catalog.
 */
export function PlanPicker({
  trialEligible,
  unavailableReason,
  heading = "Choose a plan",
}: {
  trialEligible: boolean;
  /** When set, the buttons explain instead of starting checkout. */
  unavailableReason?: string;
  heading?: string;
}) {
  const [state, formAction, pending] = React.useActionState(startCheckoutAction, idle);
  const [schedule, setSchedule] = React.useState<Schedule>("year");
  const messageRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (state.status !== "idle") messageRef.current?.focus();
  }, [state]);

  return (
    <NetworkGate>
      <form action={formAction} className="grid gap-4" aria-labelledby="plan-picker-heading">
        <div className="grid gap-1">
          <h2 id="plan-picker-heading" className="type-section-title">
            {heading}
          </h2>
          <p className="type-supporting max-w-prose">
            You’ll confirm on a secure payment page. Passoff never sees your card. Your projects,
            reviews, and issues are never deleted if you change or stop a plan.
          </p>
        </div>

        <div ref={messageRef} tabIndex={-1} className="outline-none">
          {state.status !== "idle" && state.message ? (
            <FormAlert title="We couldn’t open the payment page" description={state.message} />
          ) : null}
          {unavailableReason ? (
            <FormAlert tone="info" title="Plan changes are paused" description={unavailableReason} />
          ) : null}
        </div>

        <fieldset className="grid gap-2">
          <legend className="text-sm font-medium">Billing schedule</legend>
          <div className="inline-flex w-fit flex-wrap gap-2">
            {(
              [
                { value: "year", label: "Yearly", hint: `Save up to ${ANNUAL_SAVINGS_PERCENT}%` },
                { value: "month", label: "Monthly", hint: "Change any time" },
              ] as const
            ).map((option) => (
              <label
                key={option.value}
                className={cn(
                  "flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border border-input bg-background px-3 text-sm has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/50",
                  schedule === option.value && "border-primary bg-muted font-medium",
                )}
              >
                <input
                  type="radio"
                  name="interval"
                  value={option.value}
                  checked={schedule === option.value}
                  onChange={() => setSchedule(option.value)}
                  className="size-4 accent-primary"
                />
                <span>{option.label}</span>
                <span className="text-xs text-muted-foreground">{option.hint}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <ul className="grid gap-4 md:grid-cols-2">
          {PICKABLE.map((planId) => {
            const plan = PLAN_ENTITLEMENTS[planId];
            const trial = planId === "agency" && trialEligible;
            return (
              <li
                key={planId}
                className="grid content-start gap-4 rounded-xl border border-border bg-card p-4 sm:p-5"
                data-testid={`plan-card-${planId}`}
              >
                <div className="grid gap-1">
                  <h3 className="text-base font-semibold">{plan.name}</h3>
                  <p className="flex items-baseline gap-1.5">
                    <span className="text-3xl font-semibold tabular-nums">
                      {monthlyPriceLabel(planId, schedule)}
                    </span>
                    <span className="text-sm text-muted-foreground">
                      {billingCadenceLabel(planId, schedule)}
                    </span>
                  </p>
                </div>
                <ul className="grid gap-2 text-sm">
                  {[
                    describeMembers(planId),
                    describeReviewWebsites(planId),
                    describeVideoAllowance(planId),
                    "Unlimited guest reviewers",
                  ].map((line) => (
                    <li key={line} className="flex gap-2">
                      <Check aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-success" />
                      <span>{line}</span>
                    </li>
                  ))}
                </ul>
                <Button
                  type="submit"
                  name="plan"
                  value={planId}
                  variant={planId === "agency" ? "default" : "outline"}
                  disabled={pending || Boolean(unavailableReason)}
                  className="w-full"
                >
                  {pending
                    ? "Opening the payment page…"
                    : trial
                      ? `Start ${AGENCY_TRIAL_DAYS}-day ${plan.name} trial`
                      : `Choose ${plan.name}`}
                </Button>
                {trial ? (
                  <p className="type-supporting">
                    No card needed to start. If you don’t add one, your workspace moves to Free
                    when the trial ends and all of your work stays safe.
                  </p>
                ) : null}
              </li>
            );
          })}
        </ul>
        <p className="type-supporting">Prices are in US dollars. Applicable taxes are added at checkout.</p>
      </form>
    </NetworkGate>
  );
}
