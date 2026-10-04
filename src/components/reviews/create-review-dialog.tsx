"use client";

import * as React from "react";
import { useActionState, useEffect, useRef, useState } from "react";

import {
  createReviewAction,
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
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { REVIEW_NAME_MAX_LENGTH } from "@/lib/projects/constants";

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

function CreateReviewForm({
  projectId,
  state,
  formAction,
  pending,
  onCancel,
  alertRef,
}: {
  projectId: string;
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
              title="We couldn’t add this review"
              description={state.message}
            />
          </div>
        ) : null}

        <form action={formAction} className="grid gap-4" noValidate>
          <input type="hidden" name="projectId" value={projectId} />

          <FormField
            id="review-name"
            label="Review name"
            description="Choose a name your workspace will recognize."
            error={state.fieldErrors?.name}
          >
            <Input
              name="name"
              type="text"
              autoComplete="off"
              defaultValue={state.values?.name ?? ""}
              maxLength={REVIEW_NAME_MAX_LENGTH}
              required
              disabled={pending}
            />
          </FormField>

          <div className="grid gap-2">
            <FormField
              id="website-url"
              label="Website address"
              description="Enter an http or https address for the environment being reviewed."
              error={state.fieldErrors?.websiteUrl}
            >
              <Input
                name="websiteUrl"
                type="url"
                inputMode="url"
                autoComplete="url"
                placeholder="https://example.com"
                defaultValue={state.values?.websiteUrl ?? ""}
                required
                disabled={pending}
              />
            </FormField>
            <HelpTopicButton topicId="website-address">
              Why do we need this?
            </HelpTopicButton>
          </div>

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
              {pending ? "Adding review…" : "Add review"}
            </Button>
          </div>
          <p className="sr-only" aria-live="polite">
            {pending ? "Adding review" : ""}
          </p>
        </form>
      </div>
    </NetworkGate>
  );
}

export function CreateReviewDialog({
  projectId,
  trigger,
  open: controlledOpen,
  onOpenChange,
}: {
  projectId: string;
  trigger?: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const open = controlledOpen ?? uncontrolledOpen;
  const setOpen = onOpenChange ?? setUncontrolledOpen;
  const [state, formAction, pending] = useActionState(
    createReviewAction,
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
        document.getElementById("review-name")?.focus();
        return;
      }
      if (state.fieldErrors?.websiteUrl) {
        document.getElementById("website-url")?.focus();
        return;
      }
      alertRef.current?.focus();
    }
  }, [state]);

  const title = "Add review";
  const description =
    "Add a website environment and recorded version when it’s ready for feedback.";

  const form = (
    <CreateReviewForm
      projectId={projectId}
      state={state}
      formAction={formAction}
      pending={pending}
      onCancel={() => setOpen(false)}
      alertRef={alertRef}
    />
  );

  if (compact) {
    return (
      <Sheet open={open} onOpenChange={setOpen}>
        {trigger ? <SheetTrigger asChild>{trigger}</SheetTrigger> : null}
        <SheetContent side="bottom" className="max-h-[90vh] overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{title}</SheetTitle>
            <SheetDescription>{description}</SheetDescription>
          </SheetHeader>
          <div className="px-4 pb-4">{form}</div>
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {trigger ? <DialogTrigger asChild>{trigger}</DialogTrigger> : null}
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {form}
      </DialogContent>
    </Dialog>
  );
}
