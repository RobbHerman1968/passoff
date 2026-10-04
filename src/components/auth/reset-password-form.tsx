"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef } from "react";

import {
  resetPasswordAction,
  type ActionResult,
} from "@/app/(auth)/actions";
import { FormAlert } from "@/components/auth/form-alert";
import { NetworkGate } from "@/components/auth/network-aware-form";
import { PasswordInput } from "@/components/auth/password-input";
import { FormField } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { PASSWORD_POLICY_HINT } from "@/lib/auth/password-policy";

const initialState: ActionResult = { status: "idle" };

async function stickyResetPasswordAction(
  previous: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  if (previous.status === "success") {
    return previous;
  }
  return resetPasswordAction(previous, formData);
}

export function ResetPasswordForm({ token }: { token: string }) {
  const [state, formAction, pending] = useActionState(
    stickyResetPasswordAction,
    initialState,
  );
  const submitLock = useRef(false);
  const alertRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (state.status !== "idle") {
      alertRef.current?.focus();
    }
  }, [state]);

  if (state.status === "success") {
    return (
      <div className="grid gap-6">
        <div ref={alertRef} tabIndex={-1} className="outline-none">
          <FormAlert
            tone="success"
            title="Password updated"
            description={
              state.message ??
              "Your password has been updated. Sign in with your new password."
            }
          />
        </div>
        <Button asChild className="w-full">
          <Link href="/sign-in">Sign in</Link>
        </Button>
      </div>
    );
  }

  const linkInvalid = state.message === "This reset link is no longer valid.";

  return (
    <NetworkGate>
      <div className="grid gap-6">
        {(state.status === "error" ||
          state.status === "rate_limited" ||
          state.status === "unavailable") &&
        state.message ? (
          <div ref={alertRef} tabIndex={-1} className="outline-none">
            <FormAlert
              title="We couldn’t update your password"
              description={state.message}
            />
          </div>
        ) : null}

        {linkInvalid ? (
          <div className="flex flex-wrap gap-3">
            <Button asChild>
              <Link href="/forgot-password">Request a new reset link</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/sign-in">Return to sign in</Link>
            </Button>
          </div>
        ) : (
          <form
            action={(formData) => {
              if (submitLock.current || pending) {
                return;
              }
              submitLock.current = true;
              formAction(formData);
            }}
            className="grid gap-4"
            noValidate
          >
            <input type="hidden" name="token" value={token} />
            <FormField
              id="password"
              label="New password"
              description={PASSWORD_POLICY_HINT}
              error={state.fieldErrors?.password}
            >
              <PasswordInput
                id="password"
                name="password"
                autoComplete="new-password"
                disabled={pending}
              />
            </FormField>
            <FormField
              id="confirmPassword"
              label="Confirm new password"
              error={state.fieldErrors?.confirmPassword}
            >
              <PasswordInput
                id="confirmPassword"
                name="confirmPassword"
                autoComplete="new-password"
                disabled={pending}
              />
            </FormField>
            <Button type="submit" className="w-full" disabled={pending}>
              {pending ? "Setting new password…" : "Set new password"}
            </Button>
            <p className="sr-only" aria-live="polite">
              {pending ? "Setting new password" : ""}
            </p>
          </form>
        )}
      </div>
    </NetworkGate>
  );
}
