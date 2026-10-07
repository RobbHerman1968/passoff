"use client";

import { ExternalLink } from "lucide-react";
import * as React from "react";

import {
  openBillingPortalAction,
  type BillingActionState,
} from "@/app/(app)/settings/billing/actions";
import { FormAlert } from "@/components/auth/form-alert";
import { NetworkGate } from "@/components/auth/network-aware-form";
import { Button } from "@/components/ui/button";

const idle: BillingActionState = { status: "idle" };

/** Opens Stripe's Billing Portal, where payment details, invoices, and plan changes live. */
export function ManageBillingButton({
  label = "Manage billing",
  variant = "default",
  unavailableReason,
}: {
  label?: string;
  variant?: "default" | "outline";
  unavailableReason?: string;
}) {
  const [state, formAction, pending] = React.useActionState(openBillingPortalAction, idle);
  const messageRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (state.status !== "idle") messageRef.current?.focus();
  }, [state]);

  return (
    <NetworkGate>
      <form action={formAction} className="grid gap-3">
        <div ref={messageRef} tabIndex={-1} className="outline-none">
          {state.status !== "idle" && state.message ? (
            <FormAlert title="We couldn’t open billing" description={state.message} />
          ) : null}
        </div>
        <div>
          <Button type="submit" variant={variant} disabled={pending || Boolean(unavailableReason)}>
            {pending ? "Opening billing…" : label}
            <ExternalLink aria-hidden="true" />
          </Button>
        </div>
        {unavailableReason ? <p className="type-supporting">{unavailableReason}</p> : null}
      </form>
    </NetworkGate>
  );
}
