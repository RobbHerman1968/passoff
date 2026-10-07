"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { recordHumanVerificationAction } from "@/app/(app)/projects/verification-actions";
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
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { VerificationRunView } from "@/lib/verification/query";

export function RecordHumanVerificationDialog({
  projectId,
  reviewId,
  issueNumber,
  run,
}: {
  projectId: string;
  reviewId: string;
  issueNumber: number;
  run: VerificationRunView;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [outcome, setOutcome] = useState<"passed" | "failed" | "">("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button">Record human verification</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Record human verification</DialogTitle>
          <DialogDescription>
            Browser checks do not mark this issue as verified. Choose whether it looks fixed.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 text-sm">
          <p>
            Checked {run.actualUrl ?? run.route ?? "page"} on {run.environmentName}{" "}
            {run.versionLabel}
            {run.viewportWidth && run.viewportHeight
              ? ` at ${run.viewportWidth} × ${run.viewportHeight}`
              : ""}
            .
          </p>
          <p>{run.summary}</p>
          <fieldset className="grid gap-2">
            <legend className="font-medium">Your decision</legend>
            <label className="flex min-h-11 items-center gap-2">
              <input
                type="radio"
                name="human-outcome"
                checked={outcome === "passed"}
                onChange={() => setOutcome("passed")}
              />
              Fixed
            </label>
            <label className="flex min-h-11 items-center gap-2">
              <input
                type="radio"
                name="human-outcome"
                checked={outcome === "failed"}
                onChange={() => setOutcome("failed")}
              />
              Not fixed
            </label>
          </fieldset>
          <div className="grid gap-1">
            <Label htmlFor="human-note">Note</Label>
            <Textarea
              id="human-note"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              rows={4}
              required={outcome === "failed"}
            />
          </div>
          {error ? (
            <p role="alert" className="text-destructive">
              {error}
            </p>
          ) : null}
        </div>
        <DialogFooter>
          <Button
            type="button"
            disabled={busy || !outcome}
            onClick={async () => {
              if (!outcome) return;
              if (outcome === "failed" && note.trim().length < 8) {
                setError("Describe what still needs to change.");
                return;
              }
              setBusy(true);
              setError(null);
              const result = await recordHumanVerificationAction({
                projectId,
                reviewId,
                issueNumber,
                outcome,
                note: note.trim() || undefined,
                checkedUrl: run.actualUrl ?? undefined,
                viewportWidth: run.viewportWidth ?? undefined,
                viewportHeight: run.viewportHeight ?? undefined,
              });
              setBusy(false);
              if (!result.ok) {
                setError(result.message);
                return;
              }
              setOpen(false);
              router.refresh();
            }}
          >
            {busy ? "Saving…" : "Save verification"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
