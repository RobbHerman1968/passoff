"use client";

import { useRouter } from "next/navigation";
import { WifiOff } from "lucide-react";
import { useId, useState, type FormEvent, type ReactNode } from "react";
import { toast } from "sonner";

import { requestApprovalAction } from "@/app/(app)/projects/approval-actions";
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
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type {
  ApprovalReviewerOption,
  IssueApprovalSummary,
} from "@/lib/approvals/types";

export type ApprovalGuestLinkOption = {
  id: string;
  label: string;
};

type ReviewerChoice = "team" | "member" | "link";

const MESSAGE_MAX = 2_000;

export function RequestApprovalDialog({
  projectId,
  reviewId,
  environmentName,
  versionLabel,
  recordedAt,
  feedbackDeadline,
  issueSummary,
  reviewers,
  approvalLinks,
  replacesPendingRequest = false,
  triggerLabel,
  triggerVariant = "default",
  disabled = false,
}: {
  projectId: string;
  reviewId: string;
  environmentName: string;
  versionLabel: string;
  recordedAt: string | null;
  feedbackDeadline: string | null;
  issueSummary: IssueApprovalSummary;
  reviewers: ApprovalReviewerOption[];
  /** Active guest links that are allowed to approve. */
  approvalLinks: ApprovalGuestLinkOption[];
  /** A request is already waiting. Sending again replaces it. */
  replacesPendingRequest?: boolean;
  triggerLabel: string;
  triggerVariant?: "default" | "outline";
  disabled?: boolean;
}) {
  const router = useRouter();
  const online = useOnlineStatus();
  const uid = useId();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [choice, setChoice] = useState<ReviewerChoice>("team");
  const [reviewerUserId, setReviewerUserId] = useState("");
  const [shareLinkId, setShareLinkId] = useState("");
  const [message, setMessage] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  const unresolved = hasUnresolvedIssues(issueSummary);
  const messageId = `${uid}-message`;
  const ackId = `${uid}-ack`;
  const errorId = `${uid}-error`;

  function validate(): string | null {
    if (unresolved && !acknowledged) {
      return "Confirm that you understand some issues aren’t verified yet.";
    }
    if (choice === "member" && !reviewerUserId) {
      return "Choose a teammate to ask.";
    }
    if (choice === "link" && !shareLinkId) {
      return "Choose a guest link to ask.";
    }
    if (message.length > MESSAGE_MAX) {
      return `Keep the message under ${MESSAGE_MAX.toLocaleString("en-US")} characters.`;
    }
    return null;
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const problem = validate();
    if (problem) {
      setError(problem);
      setFailed(false);
      return;
    }
    if (!online) {
      setError("You’re offline. Your message is saved here. Reconnect and try again.");
      setFailed(true);
      return;
    }

    setPending(true);
    setError(null);
    setFailed(false);
    try {
      const result = await requestApprovalAction({
        projectId,
        reviewId,
        message: message.trim() || undefined,
        reviewerUserId: choice === "member" ? reviewerUserId : null,
        shareLinkId: choice === "link" ? shareLinkId : null,
        acknowledgeUnresolved: acknowledged,
      });
      if (!result.ok) {
        setError(result.message);
        setFailed(true);
        return;
      }
      toast.success(`Approval requested for ${versionLabel}.`);
      setOpen(false);
      setMessage("");
      setAcknowledged(false);
      router.refresh();
    } catch {
      setError(
        "We couldn’t send that request. Check your connection and try again. Your message is still here.",
      );
      setFailed(true);
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !pending && setOpen(next)}>
      <DialogTrigger asChild>
        <Button type="button" variant={triggerVariant} disabled={disabled}>
          {triggerLabel}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Ask for approval on {versionLabel}</DialogTitle>
          <DialogDescription>
            Approval covers this version only. If the site changes, you’ll need to ask
            again.
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

          {replacesPendingRequest ? (
            <Alert>
              <AlertTitle>A request is already waiting</AlertTitle>
              <AlertDescription>
                Sending this one replaces it. The earlier request stays in the history as
                replaced.
              </AlertDescription>
            </Alert>
          ) : null}

          {unresolved ? (
            <div className="grid gap-3">
              <UnresolvedIssuesWarning summary={issueSummary} />
              <div className="flex items-start gap-3">
                <input
                  id={ackId}
                  type="checkbox"
                  checked={acknowledged}
                  disabled={pending}
                  onChange={(event) => {
                    setAcknowledged(event.target.checked);
                    if (error) setError(null);
                  }}
                  className="mt-1 size-5 shrink-0 accent-primary"
                />
                <Label htmlFor={ackId} className="leading-snug">
                  I understand some issues aren’t verified yet, and I still want to ask
                  for approval.
                </Label>
              </div>
            </div>
          ) : null}

          <fieldset className="grid gap-3">
            <legend className="mb-1 text-sm font-medium">Who should decide?</legend>
            <RadioGroup
              value={choice}
              onValueChange={(value) => {
                setChoice(value as ReviewerChoice);
                setError(null);
              }}
              disabled={pending}
              aria-label="Who should decide?"
            >
              <ChoiceRow
                id={`${uid}-team`}
                value="team"
                label="Anyone on the team"
                hint="Everyone in your workspace is notified."
              />
              <ChoiceRow
                id={`${uid}-member`}
                value="member"
                label="A teammate"
                hint={reviewers.length === 0 ? "No other active teammates yet." : undefined}
                disabled={reviewers.length === 0}
              >
                {choice === "member" ? (
                  <ReviewerSelect
                    label="Teammate"
                    value={reviewerUserId}
                    onChange={setReviewerUserId}
                    placeholder="Choose a teammate"
                    options={reviewers.map((item) => ({
                      value: item.userId,
                      label: item.displayName,
                    }))}
                    disabled={pending}
                  />
                ) : null}
              </ChoiceRow>
              <ChoiceRow
                id={`${uid}-link`}
                value="link"
                label="A guest with an approval link"
                hint={
                  approvalLinks.length === 0
                    ? "No active guest link can approve yet. In Share review, create one that allows approving."
                    : undefined
                }
                disabled={approvalLinks.length === 0}
              >
                {choice === "link" ? (
                  <ReviewerSelect
                    label="Guest link"
                    value={shareLinkId}
                    onChange={setShareLinkId}
                    placeholder="Choose a guest link"
                    options={approvalLinks.map((item) => ({
                      value: item.id,
                      label: item.label,
                    }))}
                    disabled={pending}
                  />
                ) : null}
              </ChoiceRow>
            </RadioGroup>
          </fieldset>

          <div className="grid gap-2">
            <Label htmlFor={messageId}>Message (optional)</Label>
            <Textarea
              id={messageId}
              value={message}
              disabled={pending}
              maxLength={MESSAGE_MAX}
              rows={3}
              onChange={(event) => setMessage(event.target.value)}
              placeholder="Anything the reviewer should know before deciding"
            />
          </div>

          {!online ? (
            <Alert variant="warning">
              <WifiOff aria-hidden="true" />
              <AlertTitle>You’re offline</AlertTitle>
              <AlertDescription>
                Reconnect to send this request. What you typed stays here.
              </AlertDescription>
            </Alert>
          ) : null}

          {error ? (
            <Alert variant="destructive" id={errorId}>
              <AlertTitle>Couldn’t send the request</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
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
              {pending
                ? "Sending request…"
                : failed
                  ? "Try again"
                  : "Send approval request"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ChoiceRow({
  id,
  value,
  label,
  hint,
  disabled,
  children,
}: {
  id: string;
  value: ReviewerChoice;
  label: string;
  hint?: string;
  disabled?: boolean;
  children?: ReactNode;
}) {
  return (
    <div className="grid gap-2">
      <div className="flex items-start gap-3">
        <RadioGroupItem id={id} value={value} disabled={disabled} className="mt-1 size-5" />
        <div className="grid gap-0.5">
          <Label htmlFor={id} className="leading-snug">
            {label}
          </Label>
          {hint ? <p className="text-muted-foreground text-xs">{hint}</p> : null}
        </div>
      </div>
      {children ? <div className="pl-8">{children}</div> : null}
    </div>
  );
}

function ReviewerSelect({
  label,
  value,
  onChange,
  placeholder,
  options,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  options: { value: string; label: string }[];
  disabled: boolean;
}) {
  return (
    <Select value={value} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger aria-label={label} className="w-full">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
