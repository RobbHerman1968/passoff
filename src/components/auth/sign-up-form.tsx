"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef } from "react";

import { signUpAction, type ActionResult } from "@/app/(auth)/actions";
import { FormAlert } from "@/components/auth/form-alert";
import { NetworkGate } from "@/components/auth/network-aware-form";
import { PasswordInput } from "@/components/auth/password-input";
import { FormField } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PASSWORD_POLICY_HINT } from "@/lib/auth/password-policy";

const initialState: ActionResult = { status: "idle" };

export function SignUpForm({ oauthButtons }: { oauthButtons: React.ReactNode }) {
  const [state, formAction, pending] = useActionState(signUpAction, initialState);
  const alertRef = useRef<HTMLDivElement>(null);
  const firstErrorField = state.fieldErrors
    ? Object.keys(state.fieldErrors)[0]
    : null;

  useEffect(() => {
    if (state.status !== "error" && state.status !== "rate_limited") {
      return;
    }

    if (firstErrorField) {
      document.getElementById(firstErrorField)?.focus();
      return;
    }

    alertRef.current?.focus();
  }, [state, firstErrorField]);

  return (
    <NetworkGate>
      <div className="grid gap-6">
        {(state.status === "error" ||
          state.status === "rate_limited" ||
          state.status === "unavailable") &&
        state.message ? (
          <div ref={alertRef} tabIndex={-1} className="outline-none">
            <FormAlert
              title="Account couldn’t be created"
              description={state.message}
            />
          </div>
        ) : null}

        <form action={formAction} className="grid gap-4" noValidate>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField
              id="firstName"
              label="First name"
              error={state.fieldErrors?.firstName}
            >
              <Input
                name="firstName"
                type="text"
                autoComplete="given-name"
                defaultValue={state.values?.firstName ?? ""}
                disabled={pending}
                required
              />
            </FormField>
            <FormField
              id="lastName"
              label="Last name"
              error={state.fieldErrors?.lastName}
            >
              <Input
                name="lastName"
                type="text"
                autoComplete="family-name"
                defaultValue={state.values?.lastName ?? ""}
                disabled={pending}
                required
              />
            </FormField>
          </div>
          <FormField id="email" label="Email" error={state.fieldErrors?.email}>
            <Input
              name="email"
              type="email"
              autoComplete="email"
              defaultValue={state.values?.email ?? ""}
              disabled={pending}
              required
            />
          </FormField>
          <FormField
            id="password"
            label="Password"
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
            label="Confirm password"
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
            {pending ? "Creating account…" : "Create account"}
          </Button>
          <p className="sr-only" aria-live="polite">
            {pending ? "Creating account" : ""}
          </p>
        </form>

        <div className="relative">
          <div className="absolute inset-0 flex items-center" aria-hidden="true">
            <div className="w-full border-t border-border" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-background px-2 text-muted-foreground">Or</span>
          </div>
        </div>

        {oauthButtons}

        <p className="text-sm text-muted-foreground">
          Already have an account?{" "}
          <Link
            href="/sign-in"
            className="font-medium text-primary underline-offset-4 hover:underline"
          >
            Sign in
          </Link>
        </p>
      </div>
    </NetworkGate>
  );
}
