"use client";

import * as React from "react";
import { useActionState, useEffect, useRef } from "react";

import {
  createProjectAction,
  type ProjectActionResult,
} from "@/app/(app)/projects/actions";
import { FormAlert } from "@/components/auth/form-alert";
import { NetworkGate } from "@/components/auth/network-aware-form";
import { FormField } from "@/components/form-field";
import { HelpTopicButton } from "@/components/help/help-topic-button";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { PROJECT_NAME_MAX_LENGTH } from "@/lib/projects/constants";

const initialState: ProjectActionResult = { status: "idle" };

function useIsCompactViewport() {
  return React.useSyncExternalStore(
    (onStoreChange) => {
      const media = window.matchMedia("(max-width: 639px)");
      media.addEventListener("change", onStoreChange);
      return () => media.removeEventListener("change", onStoreChange);
    },
    () => window.matchMedia("(max-width: 639px)").matches,
    () => false,
  );
}

function CreateProjectForm({
  state,
  formAction,
  pending,
  onCancel,
  alertRef,
}: {
  state: ProjectActionResult;
  formAction: (payload: FormData) => void;
  pending: boolean;
  onCancel: () => void;
  alertRef: React.RefObject<HTMLDivElement | null>;
}) {
  return (
    <NetworkGate>
      <div className="grid gap-4">
        {(state.status === "error" ||
          state.status === "unavailable" ||
          state.status === "forbidden") &&
        state.message ? (
          <div ref={alertRef} tabIndex={-1} className="outline-none">
            <FormAlert
              title="We couldn’t create this project"
              description={state.message}
            />
          </div>
        ) : null}

        <form action={formAction} className="grid gap-4" noValidate>
          <FormField
            id="project-name"
            label="Project name"
            description="Name the project so your team can find it later."
            error={state.fieldErrors?.name}
          >
            <Input
              name="name"
              type="text"
              autoComplete="off"
              defaultValue={state.values?.name ?? ""}
              maxLength={PROJECT_NAME_MAX_LENGTH}
              required
              disabled={pending}
            />
          </FormField>

          <HelpTopicButton topicId="create-project">
            Why create a project?
          </HelpTopicButton>

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={onCancel}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Creating project…" : "Create project"}
            </Button>
          </div>
          <p className="sr-only" aria-live="polite">
            {pending ? "Creating project" : ""}
          </p>
        </form>
      </div>
    </NetworkGate>
  );
}

export function CreateProjectDialog({
  trigger,
  open: controlledOpen,
  onOpenChange,
}: {
  trigger?: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(false);
  const open = controlledOpen ?? uncontrolledOpen;
  const setOpen = onOpenChange ?? setUncontrolledOpen;
  const [state, formAction, pending] = useActionState(
    createProjectAction,
    initialState,
  );
  const alertRef = useRef<HTMLDivElement>(null);
  const compact = useIsCompactViewport();

  useEffect(() => {
    if (
      state.status === "error" ||
      state.status === "unavailable" ||
      state.status === "forbidden"
    ) {
      if (state.fieldErrors?.name) {
        document.getElementById("project-name")?.focus();
        return;
      }
      alertRef.current?.focus();
    }
  }, [state]);

  const title = "Create project";
  const description =
    "Add a project when you’re ready to share a website or video for review.";

  if (compact) {
    return (
      <Sheet open={open} onOpenChange={setOpen}>
        {trigger ? <SheetTrigger asChild>{trigger}</SheetTrigger> : null}
        <SheetContent side="bottom" className="max-h-[90vh] overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{title}</SheetTitle>
            <SheetDescription>{description}</SheetDescription>
          </SheetHeader>
          <div className="px-4 pb-4">
            <CreateProjectForm
              state={state}
              formAction={formAction}
              pending={pending}
              onCancel={() => setOpen(false)}
              alertRef={alertRef}
            />
          </div>
          <SheetFooter className="sr-only">Create project</SheetFooter>
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {trigger ? <DialogTrigger asChild>{trigger}</DialogTrigger> : null}
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <CreateProjectForm
          state={state}
          formAction={formAction}
          pending={pending}
          onCancel={() => setOpen(false)}
          alertRef={alertRef}
        />
        <DialogFooter className="sr-only">Create project</DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
