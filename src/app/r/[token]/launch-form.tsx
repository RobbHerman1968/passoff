"use client";

import { useActionState, useId } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  openWebsiteReviewAction,
  type LaunchActionState,
} from "@/app/r/[token]/actions";

const initial: LaunchActionState = { status: "idle" };

export function ReviewLaunchForm({
  token,
  reviewName,
  websiteHost,
}: {
  token: string;
  reviewName: string;
  websiteHost: string;
}) {
  const nameId = useId();
  const emailId = useId();
  const errorId = useId();
  const [state, action, pending] = useActionState(openWebsiteReviewAction, initial);

  return (
    <form action={action} className="mx-auto flex w-full max-w-md flex-col gap-5">
      <input type="hidden" name="token" value={token} />
      <div className="space-y-2">
        <h1 className="font-heading text-2xl font-semibold tracking-tight">
          Open website review
        </h1>
        <p className="text-muted-foreground text-sm leading-relaxed">
          You’re joining <span className="text-foreground font-medium">{reviewName}</span>{" "}
          on <span className="text-foreground font-medium">{websiteHost}</span>. Enter your
          details, then continue to the website to leave feedback.
        </p>
      </div>

      {state.status === "error" && state.message ? (
        <p
          id={errorId}
          role="alert"
          className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {state.message}
        </p>
      ) : null}

      <div className="space-y-2">
        <Label htmlFor={nameId}>Name</Label>
        <Input
          id={nameId}
          name="name"
          autoComplete="name"
          required
          defaultValue={state.values?.name ?? ""}
          aria-invalid={Boolean(state.fieldErrors?.name)}
          aria-describedby={state.fieldErrors?.name ? `${nameId}-error` : undefined}
          disabled={pending}
        />
        {state.fieldErrors?.name ? (
          <p id={`${nameId}-error`} className="text-destructive text-sm">
            {state.fieldErrors.name}
          </p>
        ) : null}
      </div>

      <div className="space-y-2">
        <Label htmlFor={emailId}>Email</Label>
        <Input
          id={emailId}
          name="email"
          type="email"
          autoComplete="email"
          required
          defaultValue={state.values?.email ?? ""}
          aria-invalid={Boolean(state.fieldErrors?.email)}
          aria-describedby={state.fieldErrors?.email ? `${emailId}-error` : undefined}
          disabled={pending}
        />
        {state.fieldErrors?.email ? (
          <p id={`${emailId}-error`} className="text-destructive text-sm">
            {state.fieldErrors.email}
          </p>
        ) : null}
      </div>

      <Button type="submit" disabled={pending} className="min-h-11">
        {pending ? "Opening review…" : "Continue to website"}
      </Button>
    </form>
  );
}
