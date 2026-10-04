"use client";

import Link from "next/link";
import * as React from "react";
import { useActionState, useEffect, useRef } from "react";

import {
  signInWithCredentialsAction,
  type ActionResult,
} from "@/app/(auth)/actions";
import { FormAlert } from "@/components/auth/form-alert";
import { NetworkGate } from "@/components/auth/network-aware-form";
import { PasswordInput } from "@/components/auth/password-input";
import { FormField } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const initialState: ActionResult = { status: "idle" };

export function SignInForm({
  callbackUrl,
  oauthError,
  oauthButtons,
}: {
  callbackUrl: string;
  oauthError?: boolean;
  oauthButtons: React.ReactNode;
}) {
  const [state, formAction, pending] = useActionState(
    signInWithCredentialsAction,
    initialState,
  );
  const alertRef = useRef<HTMLDivElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordKey = state.status === "error" || state.status === "rate_limited"
    ? `password-${state.message ?? "error"}`
    : "password";

  useEffect(() => {
    if (state.status === "error" || state.status === "rate_limited") {
      alertRef.current?.focus();
    }
  }, [state]);

  return (
    <NetworkGate>
      <div className="grid gap-6">
        {oauthError ? (
          <FormAlert
            title="We couldn’t finish signing you in"
            description="Try again, or use email and password instead."
          />
        ) : null}

        {(state.status === "error" ||
          state.status === "rate_limited" ||
          state.status === "unavailable") &&
        state.message ? (
          <div ref={alertRef} tabIndex={-1} className="outline-none">
            <FormAlert
              title="Sign-in didn’t work"
              description={state.message}
            />
          </div>
        ) : null}

        <form action={formAction} className="grid gap-4" noValidate>
          <input type="hidden" name="callbackUrl" value={callbackUrl} />
          <FormField id="email" label="Email" error={state.fieldErrors?.email}>
            <Input
              ref={emailRef}
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
            error={state.fieldErrors?.password}
          >
            <PasswordInput
              key={passwordKey}
              id="password"
              name="password"
              autoComplete="current-password"
              disabled={pending}
            />
          </FormField>
          <div className="flex justify-end">
            <Link
              href="/forgot-password"
              className="text-sm font-medium text-primary underline-offset-4 hover:underline"
            >
              Forgot password?
            </Link>
          </div>
          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? "Signing in…" : "Sign in"}
          </Button>
          <p className="sr-only" aria-live="polite">
            {pending ? "Signing in" : ""}
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
          New to Passoff?{" "}
          <Link
            href="/sign-up"
            className="font-medium text-primary underline-offset-4 hover:underline"
          >
            Create an account
          </Link>
        </p>
      </div>
    </NetworkGate>
  );
}
