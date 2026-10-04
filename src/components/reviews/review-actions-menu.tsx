"use client";

import { MoreHorizontal } from "lucide-react";
import { useActionState, useEffect, useRef, useState } from "react";

import {
  archiveReviewAction,
  renameReviewAction,
  restoreReviewAction,
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
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { REVIEW_NAME_MAX_LENGTH } from "@/lib/projects/constants";

const idle: ProjectActionResult = { status: "idle" };

export function ReviewActionsMenu({
  projectId,
  reviewId,
  reviewName,
  version,
  archived,
  disabled = false,
  triggerVariant = "outline",
}: {
  projectId: string;
  reviewId: string;
  reviewName: string;
  version: number;
  archived: boolean;
  disabled?: boolean;
  triggerVariant?: "outline" | "ghost";
}) {
  const [renameOpen, setRenameOpen] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [restoreOpen, setRestoreOpen] = useState(false);

  if (disabled) {
    return null;
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant={triggerVariant}
            size="icon"
            aria-label={`Actions for ${reviewName}`}
          >
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {!archived ? (
            <>
              <DropdownMenuItem onSelect={() => setRenameOpen(true)}>
                Rename review
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setArchiveOpen(true)}>
                Archive review
              </DropdownMenuItem>
            </>
          ) : (
            <DropdownMenuItem onSelect={() => setRestoreOpen(true)}>
              Restore review
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <RenameReviewDialog
        open={renameOpen}
        onOpenChange={setRenameOpen}
        projectId={projectId}
        reviewId={reviewId}
        reviewName={reviewName}
        version={version}
      />
      <ConfirmReviewActionDialog
        open={archiveOpen}
        onOpenChange={setArchiveOpen}
        title={`Archive ${reviewName}?`}
        description={`${reviewName} will remain available. You can restore it later without losing history.`}
        confirmLabel="Archive review"
        projectId={projectId}
        reviewId={reviewId}
        version={version}
        action={archiveReviewAction}
      />
      <ConfirmReviewActionDialog
        open={restoreOpen}
        onOpenChange={setRestoreOpen}
        title={`Restore ${reviewName}?`}
        description={`Restoring ${reviewName} makes it available in the active review list again.`}
        confirmLabel="Restore review"
        projectId={projectId}
        reviewId={reviewId}
        version={version}
        action={restoreReviewAction}
        destructive={false}
      />
    </>
  );
}

function RenameReviewDialog({
  open,
  onOpenChange,
  projectId,
  reviewId,
  reviewName,
  version,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  reviewId: string;
  reviewName: string;
  version: number;
}) {
  const [state, formAction, pending] = useActionState(renameReviewAction, idle);
  const alertRef = useRef<HTMLDivElement>(null);
  const currentVersion = state.version ?? version;
  const currentName = state.values?.name ?? reviewName;

  useEffect(() => {
    if (state.status === "error" || state.status === "conflict") {
      if (state.fieldErrors?.name) {
        document.getElementById("rename-review-name")?.focus();
        return;
      }
      alertRef.current?.focus();
    }
  }, [state]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Rename review</DialogTitle>
          <DialogDescription>
            Update the review name shown to your team.
          </DialogDescription>
        </DialogHeader>
        <NetworkGate>
          <div className="grid gap-4">
            {(state.status === "error" || state.status === "conflict") &&
            state.message ? (
              <div ref={alertRef} tabIndex={-1} className="outline-none">
                <FormAlert
                  title="We couldn’t rename this review"
                  description={state.message}
                />
              </div>
            ) : null}
            <form action={formAction} className="grid gap-4" noValidate>
              <input type="hidden" name="projectId" value={projectId} />
              <input type="hidden" name="reviewId" value={reviewId} />
              <input type="hidden" name="version" value={String(currentVersion)} />
              <FormField
                id="rename-review-name"
                label="Review name"
                error={state.fieldErrors?.name}
              >
                <Input
                  name="name"
                  type="text"
                  defaultValue={currentName}
                  key={`${currentName}-${currentVersion}-${state.status}`}
                  maxLength={REVIEW_NAME_MAX_LENGTH}
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
                  {pending ? "Saving…" : "Save review name"}
                </Button>
              </div>
            </form>
          </div>
        </NetworkGate>
      </DialogContent>
    </Dialog>
  );
}

function ConfirmReviewActionDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  projectId,
  reviewId,
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
  reviewId: string;
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
              <input type="hidden" name="reviewId" value={reviewId} />
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
