"use client";

import { useActionState, useEffect, useRef } from "react";

import {
  renameWorkspaceAction,
  type SettingsActionResult,
} from "@/app/(app)/settings/actions";
import { NetworkGate } from "@/components/auth/network-aware-form";
import { FormField } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ActionMessage } from "@/components/workspaces/action-message";
import { WORKSPACE_NAME_MAX_LENGTH } from "@/lib/workspaces/schemas";

const idle: SettingsActionResult = { status: "idle" };

export function WorkspaceNameForm({
  name,
  canRename,
}: {
  name: string;
  canRename: boolean;
}) {
  const [state, formAction, pending] = useActionState(renameWorkspaceAction, idle);
  const messageRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (state.status === "error" || state.status === "unavailable" || state.status === "forbidden") {
      if (state.fieldErrors?.name) {
        document.getElementById("workspace-name")?.focus();
        return;
      }
      messageRef.current?.focus();
    }
  }, [state]);

  if (!canRename) {
    return (
      <div className="grid gap-1">
        <p className="text-sm font-medium">Workspace name</p>
        <p className="text-sm">{name}</p>
        <p className="type-supporting">Only the workspace owner can rename the workspace.</p>
      </div>
    );
  }

  const current = state.status === "success" ? (state.values?.name ?? name) : name;

  return (
    <NetworkGate>
      <form action={formAction} className="grid max-w-md gap-4" noValidate>
        <div ref={messageRef} tabIndex={-1} className="outline-none">
          <ActionMessage result={state} errorTitle="We couldn’t rename the workspace" />
        </div>
        <FormField
          id="workspace-name"
          label="Workspace name"
          description="Shown to everyone in the workspace and in invitation emails."
          error={state.fieldErrors?.name}
        >
          <Input
            name="name"
            type="text"
            key={`${current}-${state.nonce ?? 0}`}
            defaultValue={state.status === "error" ? (state.values?.name ?? current) : current}
            maxLength={WORKSPACE_NAME_MAX_LENGTH}
            autoComplete="organization"
            disabled={pending}
            required
          />
        </FormField>
        <div>
          <Button type="submit" disabled={pending}>
            {pending ? "Saving…" : "Save workspace name"}
          </Button>
        </div>
      </form>
    </NetworkGate>
  );
}
