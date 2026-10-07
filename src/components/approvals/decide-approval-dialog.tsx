"use client";

import { useRouter } from "next/navigation";
import { WifiOff } from "lucide-react";
import { useId, useState, type FormEvent } from "react";
import { toast } from "sonner";

import {
  decideApprovalAction,
  type DecideApprovalActionResult,
} from "@/app/(app)/projects/approval-actions";
import {
  ApprovalSummary,
  UnresolvedIssuesWarning,
  hasUnresolvedIssues,
} from "@/components/approvals/approval-summary";
import { useOnlineStatus } from "@/components/issues/use-online-status";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
import {
  APPROVAL_NOTE_MAX_LENGTH,
  validateApprovalNote,
  type ApprovalDecision,
  type IssueApprovalSummary,
} from "@/lib/approvals/types";

const COPY: Record<
  ApprovalDecision,
  { trigger: string; title: string; submit: string; noteLabel: string }
> = {
  approved: {
    trigger: "Approve this review",
    title: "Approve this version",
    submit: "Approve this version",
    noteLabel: "Note (optional)",
  },
  changes_requested: {
    trigger: "Request changes",
    title: "Request changes",
    submit: "Send change request",
    noteLabel: "What needs to change?",
  },
};

export function DecideApprovalDialog({
  projectId,
  reviewId,
  deploymentId,
  requestId,
  decision,
  environmentName,
  versionLabel,
  recordedAt,
  feedbackDeadline,
  issueSummary,
  triggerVariant,
  disabled = false,
}: {
  projectId: string;
  reviewId: string;
  deploymentId: string;
  requestId: string | null;
  decision: ApprovalDecision;
  environmentName: string;
  versionLabel: string;
  recordedAt: string | null;
  feedbackDeadline: string | null;
  issueSummary: IssueApprovalSummary;
  triggerVariant?: "default" | "outline";
  disabled?: boolean;
}) {
  const router = useRouter();
  const online = useOnlineStatus();
  const uid = useId();
  const noteId = `${uid}-note`;
  const copy = COPY[decision];
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [note, setNote] = useState("");
  const [noteError, setNoteError] = useState<string | null>(null);
  const [failure, setFailure] = useState<{
    message: string;
    stale: boolean;
  } | null>(null);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const checked = validateApprovalNote(decision, note);
    if (!checked.ok) {
      setNoteError(checked.message);
      return;
    }
    setNoteError(null);
    setFailure(null);
    setPending(true);
    let result: DecideApprovalActionResult;
    try {
      result = await decideApprovalAction({
        projectId,
        reviewId,
        decision,
        note: checked.note ?? undefined,
        deploymentId,
        requestId,
      });
    } catch {
      result = {
        ok: false,
        message:
          "We couldn’t save your decision. Check your connection and try again. Your note is still here.",
      };
    }
    setPending(false);

    if (!result.ok) {
      setFailure({ message: result.message, stale: result.reason === "stale_version" });
      return;
    }
    toast.success(result.message);
    setOpen(false);
    setNote("");
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !pending && setOpen(next)}>
      <DialogTrigger asChild>
        <Button type="button" variant={triggerVariant} disabled={disabled}>
          {copy.trigger}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {copy.title} · {versionLabel}
          </DialogTitle>
          <DialogDescription>
            {decision === "approved"
              ? "This approval covers this version only, not later changes to the site."
              : "Tell the team what to fix. They’ll be notified right away."}
          </DialogDescription>
        </DialogHeader>

        <form className="grid gap-4" onSubmit={onSubmit} noValidate>
          <ApprovalSummary
            environmentName={environmentName}
            versionLabel={versionLabel}
            recordedAt={recordedAt}
            feedbackDeadline={feedbackDeadline}
            issueSummary={issueSummary}
          />
          {decision === "approved" && hasUnresolvedIssues(issueSummary) ? (
            <UnresolvedIssuesWarning summary={issueSummary} />
          ) : null}

          <div className="grid gap-2">
            <Label htmlFor={noteId}>{copy.noteLabel}</Label>
            <Textarea
              id={noteId}
              value={note}
              disabled={pending}
              rows={4}
              maxLength={APPROVAL_NOTE_MAX_LENGTH}
              aria-invalid={noteError ? true : undefined}
              aria-describedby={noteError ? `${noteId}-error` : undefined}
              onChange={(event) => {
                setNote(event.target.value);
                if (noteError) setNoteError(null);
              }}
            />
            {noteError ? (
              <p id={`${noteId}-error`} className="text-destructive text-sm">
                {noteError}
              </p>
            ) : null}
          </div>

          {!online ? (
            <Alert variant="warning">
              <WifiOff aria-hidden="true" />
              <AlertTitle>You’re offline</AlertTitle>
              <AlertDescription>
                Reconnect to save your decision. What you typed stays here.
              </AlertDescription>
            </Alert>
          ) : null}

          {failure ? (
            <Alert variant="destructive">
              <AlertTitle>Couldn’t save your decision</AlertTitle>
              <AlertDescription>
                {failure.message}
                {failure.stale ? (
                  <>
                    {" "}
                    <button
                      type="button"
                      className="underline underline-offset-4"
                      onClick={() => {
                        setOpen(false);
                        router.refresh();
                      }}
                    >
                      Reload this review
                    </button>
                  </>
                ) : null}
              </AlertDescription>
            </Alert>
          ) : null}

          <DialogFooter className="gap-2 sm:gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={() => setOpen(false)}
            >
              Not now
            </Button>
            <Button type="submit" disabled={pending || !online}>
              {pending ? "Saving…" : failure && !failure.stale ? "Try again" : copy.submit}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
