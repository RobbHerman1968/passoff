"use client";

import { useActionState, useEffect, useRef } from "react";

import { createWorkspaceAction, type ActionResult } from "@/app/(auth)/actions";
import { FormAlert } from "@/components/auth/form-alert";
import { NetworkGate } from "@/components/auth/network-aware-form";
import { FormField } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const initialState: ActionResult = { status: "idle" };

export function OnboardingForm() {
  const [state, formAction, pending] = useActionState(
    createWorkspaceAction,
    initialState,
  );
  const alertRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (state.status === "error" || state.status === "unavailable") {
      if (state.fieldErrors?.workspaceName) {
        document.getElementById("workspaceName")?.focus();
        return;
      }
      alertRef.current?.focus();
    }
  }, [state]);

  return (
    <NetworkGate>
      <div className="grid gap-6">
        {(state.status === "error" || state.status === "unavailable") &&
        state.message ? (
          <div ref={alertRef} tabIndex={-1} className="outline-none">
            <FormAlert
              title="We couldn’t create your workspace"
              description={state.message}
            />
          </div>
        ) : null}

        <form action={formAction} className="grid gap-4" noValidate>
          <FormField
            id="workspaceName"
            label="Workspace name"
            description="Usually your studio or company name. You can change it later."
            error={state.fieldErrors?.workspaceName}
          >
            <Input
              name="workspaceName"
              type="text"
              autoComplete="organization"
              defaultValue={state.values?.workspaceName ?? ""}
              disabled={pending}
              required
            />
          </FormField>
          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? "Creating workspace…" : "Create your workspace"}
          </Button>
          <p className="sr-only" aria-live="polite">
            {pending ? "Creating workspace" : ""}
          </p>
        </form>
      </div>
    </NetworkGate>
  );
}
