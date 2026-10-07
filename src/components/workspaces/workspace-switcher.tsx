"use client";

import { ChevronsUpDown } from "lucide-react";
import * as React from "react";

import { switchWorkspaceAction } from "@/app/(app)/workspaces/actions";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export type WorkspaceOption = {
  id: string;
  name: string;
  role: "owner" | "member";
};

const ROLE_LABELS: Record<WorkspaceOption["role"], string> = {
  owner: "Owner",
  member: "Member",
};

function WorkspaceCardBody({
  name,
  role,
}: {
  name: string;
  role: WorkspaceOption["role"];
}) {
  return (
    <>
      <span
        aria-hidden="true"
        className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary text-sm font-semibold text-primary-foreground"
      >
        {name.trim().charAt(0).toUpperCase() || "W"}
      </span>
      <span className="grid min-w-0 flex-1 text-left">
        <span className="truncate text-sm font-medium">{name}</span>
        <span className="text-xs text-muted-foreground">{ROLE_LABELS[role]}</span>
      </span>
    </>
  );
}

/**
 * Shows the current workspace. People who belong to more than one get a menu to switch.
 * Choosing a workspace asks the server to confirm membership before it is remembered.
 */
export function WorkspaceSwitcher({
  current,
  workspaces,
}: {
  current: WorkspaceOption;
  workspaces: WorkspaceOption[];
}) {
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);

  if (workspaces.length <= 1) {
    return (
      <div className="flex items-center gap-3 rounded-lg bg-background/60 p-2 ring-1 ring-sidebar-border">
        <WorkspaceCardBody name={current.name} role={current.role} />
      </div>
    );
  }

  function choose(workspaceId: string) {
    if (workspaceId === current.id) return;
    setError(null);
    startTransition(async () => {
      try {
        const result = await switchWorkspaceAction(workspaceId);
        if (result.status === "error") {
          setError(result.message ?? "We couldn’t switch workspaces. Try again.");
        }
      } catch (caught) {
        if (caught && typeof caught === "object" && "digest" in caught) throw caught;
        setError("We couldn’t switch workspaces. Check your connection and try again.");
      }
    });
  }

  return (
    <div className="grid gap-1">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            disabled={pending}
            aria-label={`Workspace: ${current.name}. Switch workspace`}
            className="h-auto min-h-12 w-full justify-start gap-3 bg-background/60 p-2 ring-1 ring-sidebar-border hover:bg-sidebar-accent"
          >
            <WorkspaceCardBody name={current.name} role={current.role} />
            <ChevronsUpDown aria-hidden="true" className="text-muted-foreground" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-64">
          <DropdownMenuLabel>Your workspaces</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuRadioGroup value={current.id} onValueChange={choose}>
            {workspaces.map((workspace) => (
              <DropdownMenuRadioItem key={workspace.id} value={workspace.id}>
                <span className="grid min-w-0">
                  <span className="truncate">{workspace.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {ROLE_LABELS[workspace.role]}
                  </span>
                </span>
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      <p role="status" aria-live="polite" className="px-1 text-xs text-muted-foreground">
        {pending ? "Switching workspace…" : ""}
      </p>
      {error ? (
        <p role="alert" className="px-1 text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
