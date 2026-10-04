"use client";

import { MoreHorizontal } from "lucide-react";
import { useActionState, useEffect, useRef, useState } from "react";

import {
  archiveProjectAction,
  deleteProjectAction,
  renameProjectAction,
  restoreProjectAction,
  type ProjectActionResult,
} from "@/app/(app)/projects/actions";
import { FormAlert } from "@/components/auth/form-alert";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { PROJECT_NAME_MAX_LENGTH } from "@/lib/projects/constants";
import type { ProjectStatus } from "@/lib/projects/statuses";

const idle: ProjectActionResult = { status: "idle" };

export function ProjectActionsMenu({
  projectId,
  projectName,
  status,
  version,
  canDelete,
  readOnly = false,
  triggerVariant = "outline",
}: {
  projectId: string;
  projectName: string;
  status: ProjectStatus;
  version: number;
  canDelete: boolean;
  readOnly?: boolean;
  triggerVariant?: "outline" | "ghost";
}) {
  const [renameOpen, setRenameOpen] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [restoreOpen, setRestoreOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant={triggerVariant}
            size="icon"
            aria-label={`Actions for ${projectName}`}
          >
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {!readOnly && status === "active" ? (
            <DropdownMenuItem onSelect={() => setRenameOpen(true)}>
              Rename project
            </DropdownMenuItem>
          ) : null}
          {status === "active" ? (
            <DropdownMenuItem onSelect={() => setArchiveOpen(true)}>
              Archive project
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem onSelect={() => setRestoreOpen(true)}>
              Restore project
            </DropdownMenuItem>
          )}
          {canDelete ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                onSelect={() => setDeleteOpen(true)}
              >
                Delete project
              </DropdownMenuItem>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>

      <RenameProjectDialog
        open={renameOpen}
        onOpenChange={setRenameOpen}
        projectId={projectId}
        projectName={projectName}
        version={version}
      />
      <ConfirmProjectActionDialog
        open={archiveOpen}
        onOpenChange={setArchiveOpen}
        title={`Archive ${projectName}?`}
        description={`${projectName} will stay available under Archived. You can restore it later without losing reviews.`}
        confirmLabel="Archive project"
        projectId={projectId}
        version={version}
        action={archiveProjectAction}
      />
      <ConfirmProjectActionDialog
        open={restoreOpen}
        onOpenChange={setRestoreOpen}
        title={`Restore ${projectName}?`}
        description={`Restoring ${projectName} makes its reviews available again.`}
        confirmLabel="Restore project"
        projectId={projectId}
        version={version}
        action={restoreProjectAction}
        destructive={false}
      />
      <DeleteProjectDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        projectId={projectId}
        projectName={projectName}
        version={version}
      />
    </>
  );
}

function RenameProjectDialog({
  open,
  onOpenChange,
  projectId,
  projectName,
  version,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  projectName: string;
  version: number;
}) {
  const [state, formAction, pending] = useActionState(
    renameProjectAction,
    idle,
  );
  const alertRef = useRef<HTMLDivElement>(null);
  const currentVersion = state.version ?? version;
  const currentName = state.values?.name ?? projectName;

  useEffect(() => {
    if (state.status === "error" || state.status === "conflict") {
      if (state.fieldErrors?.name) {
        document.getElementById("rename-project-name")?.focus();
        return;
      }
      alertRef.current?.focus();
    }
  }, [state]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Rename project</DialogTitle>
          <DialogDescription>
            Update the project name shown to your team.
          </DialogDescription>
        </DialogHeader>
        <NetworkGate>
          <div className="grid gap-4">
            {(state.status === "error" || state.status === "conflict") &&
            state.message ? (
              <div ref={alertRef} tabIndex={-1} className="outline-none">
                <FormAlert title="We couldn’t rename this project" description={state.message} />
              </div>
            ) : null}
            <form action={formAction} className="grid gap-4" noValidate>
              <input type="hidden" name="projectId" value={projectId} />
              <input type="hidden" name="version" value={String(currentVersion)} />
              <FormField
                id="rename-project-name"
                label="Project name"
                error={state.fieldErrors?.name}
              >
                <Input
                  name="name"
                  type="text"
                  defaultValue={currentName}
                  key={`${currentName}-${currentVersion}-${state.status}`}
                  maxLength={PROJECT_NAME_MAX_LENGTH}
                  required
                  disabled={pending}
                />
              </FormField>
              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => onOpenChange(false)}
                  disabled={pending}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={pending}>
                  {pending ? "Saving…" : "Save project name"}
                </Button>
              </div>
            </form>
          </div>
        </NetworkGate>
      </DialogContent>
    </Dialog>
  );
}

function ConfirmProjectActionDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  projectId,
  version,
  action,
  destructive = true,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel: string;
  projectId: string;
  version: number;
  action: (
    prev: ProjectActionResult,
    formData: FormData,
  ) => Promise<ProjectActionResult>;
  destructive?: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, idle);
  const alertRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (state.status === "error" || state.status === "conflict") {
      alertRef.current?.focus();
    }
  }, [state]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <NetworkGate>
          <div className="grid gap-4">
            {(state.status === "error" || state.status === "conflict") &&
            state.message ? (
              <div ref={alertRef} tabIndex={-1} className="outline-none">
                <FormAlert title="Something went wrong" description={state.message} />
              </div>
            ) : null}
            <form action={formAction} className="grid gap-4">
              <input type="hidden" name="projectId" value={projectId} />
              <input
                type="hidden"
                name="version"
                value={String(state.version ?? version)}
              />
              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => onOpenChange(false)}
                  disabled={pending}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant={destructive ? "destructive" : "default"}
                  disabled={pending}
                >
                  {pending ? "Working…" : confirmLabel}
                </Button>
              </div>
            </form>
          </div>
        </NetworkGate>
      </DialogContent>
    </Dialog>
  );
}

function DeleteProjectDialog({
  open,
  onOpenChange,
  projectId,
  projectName,
  version,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  projectName: string;
  version: number;
}) {
  const [state, formAction, pending] = useActionState(
    deleteProjectAction,
    idle,
  );
  const alertRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (
      state.status === "error" ||
      state.status === "conflict" ||
      state.status === "forbidden"
    ) {
      if (state.fieldErrors?.confirmationName) {
        document.getElementById("delete-project-confirmation")?.focus();
        return;
      }
      alertRef.current?.focus();
    }
  }, [state]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{`Delete ${projectName}?`}</DialogTitle>
          <DialogDescription>
            {`${projectName}, its reviews, and future feedback history will be removed after Passoff’s retention process. This cannot be undone from ordinary project lists.`}
          </DialogDescription>
        </DialogHeader>
        <NetworkGate>
          <div className="grid gap-4">
            {(state.status === "error" ||
              state.status === "conflict" ||
              state.status === "forbidden") &&
            state.message ? (
              <div ref={alertRef} tabIndex={-1} className="outline-none">
                <FormAlert title="We couldn’t delete this project" description={state.message} />
              </div>
            ) : null}
            <form action={formAction} className="grid gap-4" noValidate>
              <input type="hidden" name="projectId" value={projectId} />
              <input
                type="hidden"
                name="version"
                value={String(state.version ?? version)}
              />
              <FormField
                id="delete-project-confirmation"
                label="Type the project name to confirm"
                description={`Type “${projectName}” to delete this project.`}
                error={state.fieldErrors?.confirmationName}
              >
                <Input
                  name="confirmationName"
                  type="text"
                  autoComplete="off"
                  defaultValue={state.values?.confirmationName ?? ""}
                  required
                  disabled={pending}
                />
              </FormField>
              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => onOpenChange(false)}
                  disabled={pending}
                >
                  Cancel
                </Button>
                <Button type="submit" variant="destructive" disabled={pending}>
                  {pending ? "Deleting…" : "Delete project"}
                </Button>
              </div>
            </form>
          </div>
        </NetworkGate>
      </DialogContent>
    </Dialog>
  );
}
