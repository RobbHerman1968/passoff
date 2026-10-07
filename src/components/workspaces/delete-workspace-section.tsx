"use client";

import { Trash2 } from "lucide-react";
import { useActionState, useEffect, useRef, useState } from "react";

import {
  deleteWorkspaceAction,
  type SettingsActionResult,
} from "@/app/(app)/settings/actions";
import { NetworkGate } from "@/components/auth/network-aware-form";
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
import { WORKSPACE_PURGE_DELAY_DAYS } from "@/lib/workspaces/schemas";

const idle: SettingsActionResult = { status: "idle" };

export function DeleteWorkspaceSection({
  workspaceId,
  workspaceName,
}: {
  workspaceId: string;
  workspaceName: string;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(deleteWorkspaceAction, idle);
  const [typed, setTyped] = useState("");
  const messageRef = useRef<HTMLDivElement>(null);
  const matches = typed.trim() === workspaceName;

  useEffect(() => {
    if (state.status === "error" || state.status === "unavailable" || state.status === "forbidden") {
      if (state.fieldErrors?.confirmName) {
        document.getElementById("confirm-workspace-name")?.focus();
        return;
      }
      messageRef.current?.focus();
    }
  }, [state]);

  return (
    <section
      aria-labelledby="delete-workspace-heading"
      className="grid gap-3 rounded-xl border border-destructive/50 bg-card p-4 sm:p-5"
    >
      <div className="grid gap-1">
        <h2 id="delete-workspace-heading" className="type-section-title">
          Delete this workspace
        </h2>
        <p className="type-supporting max-w-prose">
          This closes {workspaceName} for everyone right away: projects, reviews, issues, guest links,
          and website installs stop working. We keep the data for {WORKSPACE_PURGE_DELAY_DAYS} days
          while stored videos are removed, then delete it for good. This can’t be undone.
        </p>
      </div>
      <div>
        <Button type="button" variant="destructive" onClick={() => setOpen(true)}>
          <Trash2 aria-hidden="true" />
          Delete workspace…
        </Button>
      </div>

      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) setTyped("");
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete {workspaceName}?</DialogTitle>
            <DialogDescription>
              Everyone in {workspaceName} loses access immediately. Guest links and website installs
              stop working. Type the workspace name to confirm.
            </DialogDescription>
          </DialogHeader>
          <NetworkGate>
            <form action={formAction} className="grid gap-4" noValidate>
              <input type="hidden" name="workspaceId" value={workspaceId} />
              <div ref={messageRef} tabIndex={-1} className="outline-none">
                <ActionMessage result={state} errorTitle="We couldn’t delete the workspace" />
              </div>
              <FormField
                id="confirm-workspace-name"
                label={`Type “${workspaceName}” to confirm`}
                error={state.fieldErrors?.confirmName}
              >
                <Input
                  name="confirmName"
                  type="text"
                  autoComplete="off"
                  value={typed}
                  onChange={(event) => setTyped(event.target.value)}
                  disabled={pending}
                />
              </FormField>
              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={pending}>
                  Keep workspace
                </Button>
                <Button type="submit" variant="destructive" disabled={pending || !matches}>
                  {pending ? "Deleting…" : "Delete workspace"}
                </Button>
              </div>
            </form>
          </NetworkGate>
        </DialogContent>
      </Dialog>
    </section>
  );
}
