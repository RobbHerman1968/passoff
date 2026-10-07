"use client";

import { useActionState, useEffect, useRef } from "react";

import {
  updateProfileAction,
  type SettingsActionResult,
} from "@/app/(app)/settings/actions";
import { NetworkGate } from "@/components/auth/network-aware-form";
import { FormField } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ActionMessage } from "@/components/workspaces/action-message";

const idle: SettingsActionResult = { status: "idle" };

export function ProfileForm({
  firstName,
  lastName,
  email,
}: {
  firstName: string;
  lastName: string;
  email: string;
}) {
  const [state, formAction, pending] = useActionState(updateProfileAction, idle);
  const messageRef = useRef<HTMLDivElement>(null);
  const first = state.values?.firstName ?? firstName;
  const last = state.values?.lastName ?? lastName;

  useEffect(() => {
    if (state.status === "error" || state.status === "unavailable") {
      const firstField = state.fieldErrors ? Object.keys(state.fieldErrors)[0] : null;
      if (firstField) {
        document.getElementById(firstField)?.focus();
        return;
      }
      messageRef.current?.focus();
    }
  }, [state]);

  return (
    <NetworkGate>
      <form action={formAction} className="grid max-w-md gap-4" noValidate>
        <div ref={messageRef} tabIndex={-1} className="outline-none">
          <ActionMessage result={state} errorTitle="We couldn’t save your name" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField id="firstName" label="First name" error={state.fieldErrors?.firstName}>
            <Input name="firstName" type="text" autoComplete="given-name" defaultValue={first} key={`f-${first}`} disabled={pending} required />
          </FormField>
          <FormField id="lastName" label="Last name" error={state.fieldErrors?.lastName}>
            <Input name="lastName" type="text" autoComplete="family-name" defaultValue={last} key={`l-${last}`} disabled={pending} required />
          </FormField>
        </div>
        <div className="grid gap-1">
          <p className="text-sm font-medium">Email address</p>
          <p className="text-sm [overflow-wrap:anywhere]">{email}</p>
          <p className="type-supporting">Your email is how you sign in, so it can’t be changed here.</p>
        </div>
        <div>
          <Button type="submit" disabled={pending}>
            {pending ? "Saving…" : "Save name"}
          </Button>
        </div>
      </form>
    </NetworkGate>
  );
}
