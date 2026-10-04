"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef } from "react";

import {
  forgotPasswordAction,
  type ActionResult,
} from "@/app/(auth)/actions";
import { FormAlert } from "@/components/auth/form-alert";
import { NetworkGate } from "@/components/auth/network-aware-form";
import { FormField } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const initialState: ActionResult = { status: "idle" };

export function ForgotPasswordForm() {
  const [state, formAction, pending] = useActionState(
    forgotPasswordAction,
    initialState,
  );
  const alertRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (
      state.status === "error" ||
      state.status === "rate_limited" ||
      state.status === "unavailable" ||
      state.status === "success"
    ) {
      alertRef.current?.focus();
    }
  }, [state]);

  return (
    <NetworkGate>
      <div className="grid gap-6">
        {state.status === "success" && state.message ? (
          <div ref={alertRef} tabIndex={-1} className="outline-none">
            <FormAlert
              tone="success"
              title="Check your email"
              description={state.message}
            />
          </div>
        ) : null}

        {(state.status === "error" ||
          state.status === "rate_limited" ||
          state.status === "unavailable") &&
        state.message ? (
          <div ref={alertRef} tabIndex={-1} className="outline-none">
            <FormAlert title="We couldn’t send a reset link" description={state.message} />
          </div>
        ) : null}

        <form action={formAction} className="grid gap-4" noValidate>
          <FormField id="email" label="Email" error={state.fieldErrors?.email}>
            <Input
              name="email"
              type="email"
              autoComplete="email"
              defaultValue={state.values?.email ?? ""}
              disabled={pending || state.status === "success"}
              required
            />
          </FormField>
          <Button
            type="submit"
            className="w-full"
            disabled={pending || state.status === "success"}
          >
            {pending ? "Sending reset link…" : "Send reset link"}
          </Button>
          <p className="sr-only" aria-live="polite">
            {pending ? "Sending reset link" : state.status === "success" ? "Reset link accepted" : ""}
          </p>
        </form>

        <p className="text-sm text-muted-foreground">
          <Link
            href="/sign-in"
            className="font-medium text-primary underline-offset-4 hover:underline"
          >
            Return to sign in
          </Link>
        </p>
      </div>
    </NetworkGate>
  );
}
