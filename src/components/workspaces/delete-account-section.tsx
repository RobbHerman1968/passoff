"use client";

import { Trash2 } from "lucide-react";
import { useActionState, useEffect, useRef, useState } from "react";

import {
  deleteAccountAction,
  type SettingsActionResult,
} from "@/app/(app)/settings/actions";
import { NetworkGate } from "@/components/auth/network-aware-form";
import { PasswordInput } from "@/components/auth/password-input";
import { FormField } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ActionMessage } from "@/components/workspaces/action-message";

const idle: SettingsActionResult = { status: "idle" };

export type AccountBlocker = { workspaceId: string; workspaceName: string; otherMembers: number };

export function DeleteAccountSection({
  hasPassword,
  email,
  blockers,
  soleWorkspaces,
}: {
  hasPassword: boolean;
  email: string;
  blockers: AccountBlocker[];
  soleWorkspaces: string[];
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(deleteAccountAction, idle);
  const messageRef = useRef<HTMLDivElement>(null);
  const blocked = blockers.length > 0;

  useEffect(() => {
    if (state.status === "error" || state.status === "unavailable" || state.status === "forbidden") {
      const firstField = state.fieldErrors ? Object.keys(state.fieldErrors)[0] : null;
      if (firstField) {
        document.getElementById(firstField === "password" ? "delete-account-password" : "delete-account-email")?.focus();
        return;
      }
      messageRef.current?.focus();
    }
  }, [state]);

  return (
    <section
      aria-labelledby="delete-account-heading"
      className="grid gap-3 rounded-xl border border-destructive/50 bg-card p-4 sm:p-5"
    >
      <div className="grid gap-1">
        <h2 id="delete-account-heading" className="type-section-title">
          Delete your account
        </h2>
        <p className="type-supporting max-w-prose">
          This permanently closes your Passoff account and signs you out everywhere. Comments and
          history you added stay for your teammates, shown as “Former member.”
        </p>
      </div>

      {blocked ? (
        <div role="status" className="rounded-lg border border-input bg-muted/50 p-3 text-sm">
          <p className="font-semibold">You can’t delete your account yet.</p>
          <p className="mt-1">
            You’re the owner of {blockers.map((blocker) => blocker.workspaceName).join(", ")}, which
            still {blockers.length === 1 ? "has" : "have"} other people in{" "}
            {blockers.length === 1 ? "it" : "them"}. Make someone else the owner on the Members page,
            or remove the other people first.
          </p>
        </div>
      ) : null}

      <div>
        <Button type="button" variant="destructive" disabled={blocked} onClick={() => setOpen(true)}>
          <Trash2 aria-hidden="true" />
          Delete my account…
        </Button>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete your account?</DialogTitle>
            <DialogDescription>
              This can’t be undone.
              {soleWorkspaces.length > 0
                ? ` ${soleWorkspaces.join(", ")} ${soleWorkspaces.length === 1 ? "has" : "have"} no other people, so ${soleWorkspaces.length === 1 ? "it" : "they"} will be deleted too.`
                : ""}{" "}
              {hasPassword ? "Enter your password to confirm." : "Type your email address to confirm."}
            </DialogDescription>
          </DialogHeader>
          <NetworkGate>
            <form action={formAction} className="grid gap-4" noValidate>
              <div ref={messageRef} tabIndex={-1} className="outline-none">
                <ActionMessage result={state} errorTitle="We couldn’t delete your account" />
              </div>
              {hasPassword ? (
                <FormField id="delete-account-password" label="Password" error={state.fieldErrors?.password}>
                  <PasswordInput id="delete-account-password" name="password" autoComplete="current-password" disabled={pending} />
                </FormField>
              ) : (
                <FormField
                  id="delete-account-email"
                  label={`Type ${email} to confirm`}
                  error={state.fieldErrors?.confirmEmail}
                >
                  <Input name="confirmEmail" type="email" autoComplete="off" disabled={pending} />
                </FormField>
              )}
              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={pending}>
                  Keep my account
                </Button>
                <Button type="submit" variant="destructive" disabled={pending}>
                  {pending ? "Deleting…" : "Delete my account"}
                </Button>
              </div>
            </form>
          </NetworkGate>
        </DialogContent>
      </Dialog>
    </section>
  );
}
