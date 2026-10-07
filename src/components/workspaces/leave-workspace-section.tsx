"use client";

import { LogOut } from "lucide-react";
import * as React from "react";

import { leaveWorkspaceAction } from "@/app/(app)/settings/actions";
import { Button } from "@/components/ui/button";
import { ActionMessage } from "@/components/workspaces/action-message";
import { ConfirmActionDialog } from "@/components/workspaces/confirm-action-dialog";
import { useSettingsAction } from "@/components/workspaces/use-settings-action";

export function LeaveWorkspaceSection({
  workspaceName,
  isOwner,
}: {
  workspaceName: string;
  isOwner: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  const { pending, result, run } = useSettingsAction();

  return (
    <section aria-labelledby="leave-heading" className="grid gap-3 rounded-xl border border-border bg-card p-4 sm:p-5">
      <div className="grid gap-1">
        <h2 id="leave-heading" className="type-section-title">
          Leave {workspaceName}
        </h2>
        <p className="type-supporting max-w-prose">
          {isOwner
            ? "You own this workspace, so you can’t leave it yet. Make someone else the owner on the Members page first, or delete the workspace if you’re done with it."
            : "You’ll lose access to its projects and reviews. Issues assigned to you become unassigned, and your earlier comments stay."}
        </p>
      </div>
      <ActionMessage result={result} errorTitle="We couldn’t leave the workspace" />
      {isOwner ? null : (
        <div>
          <Button type="button" variant="outline" disabled={pending} onClick={() => setOpen(true)}>
            <LogOut aria-hidden="true" />
            Leave workspace…
          </Button>
        </div>
      )}
      <ConfirmActionDialog
        open={open}
        onOpenChange={setOpen}
        title={`Leave ${workspaceName}?`}
        description="You’ll lose access right away. To come back, the owner has to invite you again."
        confirmLabel="Leave workspace"
        onConfirm={() => run(leaveWorkspaceAction, {})}
      />
    </section>
  );
}
