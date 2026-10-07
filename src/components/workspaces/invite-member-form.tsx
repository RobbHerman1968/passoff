"use client";

import { useActionState, useEffect, useRef } from "react";

import {
  inviteMemberAction,
  type SettingsActionResult,
} from "@/app/(app)/settings/actions";
import { NetworkGate } from "@/components/auth/network-aware-form";
import { FormField } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ActionMessage } from "@/components/workspaces/action-message";

const idle: SettingsActionResult = { status: "idle" };

export function InviteMemberForm({
  atCapacity,
  capacityMessage,
}: {
  atCapacity: boolean;
  capacityMessage?: string;
}) {
  const [state, formAction, pending] = useActionState(inviteMemberAction, idle);
  const messageRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (state.status === "error" || state.status === "unavailable" || state.status === "forbidden") {
      if (state.fieldErrors?.email) {
        document.getElementById("invite-email")?.focus();
        return;
      }
      messageRef.current?.focus();
    }
  }, [state]);

  return (
    <NetworkGate>
      <form action={formAction} className="grid gap-4" noValidate>
        <div ref={messageRef} tabIndex={-1} className="outline-none">
          <ActionMessage result={state} errorTitle="We couldn’t send the invitation" />
        </div>
        {atCapacity && capacityMessage ? (
          <p role="status" className="rounded-lg border border-input bg-muted/50 p-3 text-sm">
            {capacityMessage}
          </p>
        ) : null}
        <div className="grid max-w-md gap-4">
          <FormField
            id="invite-email"
            label="Email address"
            description="We’ll email a link that works for this address only. It expires in 7 days."
            error={state.fieldErrors?.email}
          >
            <Input
              name="email"
              type="email"
              autoComplete="off"
              key={state.status === "success" ? `sent-${state.nonce}` : "invite"}
              defaultValue={state.status === "success" ? "" : (state.values?.email ?? "")}
              disabled={pending}
              required
            />
          </FormField>
          <div>
            <Button type="submit" disabled={pending || atCapacity}>
              {pending ? "Sending…" : "Send invitation"}
            </Button>
          </div>
        </div>
      </form>
    </NetworkGate>
  );
}
