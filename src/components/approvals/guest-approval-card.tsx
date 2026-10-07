"use client";

import { CheckCircle2 } from "lucide-react";
import { useActionState, useId, useState } from "react";

import {
  decideApprovalFromLinkAction,
  type GuestApprovalActionState,
} from "@/app/r/[token]/approval-actions";
import { ApprovalStatusPill } from "@/components/approvals/approval-status-pill";
import {
  ApprovalSummary,
  UnresolvedIssuesWarning,
  hasUnresolvedIssues,
} from "@/components/approvals/approval-summary";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import {
  APPROVAL_NOTE_MAX_LENGTH,
  type ApprovalDecision,
  type GuestApprovalOffer,
} from "@/lib/approvals/types";

const initial: GuestApprovalActionState = { status: "idle" };

const BLOCKED_COPY: Record<
  NonNullable<GuestApprovalOffer["blockedReason"]>,
  string
> = {
  view_only:
    "This link lets you view and comment, but not approve. Ask the team for an approval link if you need to sign off.",
  no_request: "The team hasn’t asked for approval on this version yet.",
  someone_else: "This approval request was sent to someone else.",
  already_decided: "A decision has already been recorded for this version.",
};

/**
 * Guest approval on the Passoff link page. Guests with a view-only link see the status
 * but never a decision form.
 */
export function GuestApprovalCard({
  token,
  offer,
}: {
  token: string;
  offer: GuestApprovalOffer;
}) {
  const { status } = offer;
  const request = status.activeRequest;
  const lastApproved = status.history.find((row) => row.state === "approved");

  return (
    <section
      aria-labelledby="guest-approval-heading"
      className="mx-auto mt-8 grid w-full max-w-md gap-4 rounded-xl border border-border bg-card p-4 text-card-foreground"
    >
      <div className="grid gap-2">
        <h2 id="guest-approval-heading" className="font-heading text-lg font-semibold">
          Approval
        </h2>
        <ApprovalStatusPill
          state={status.visibleState}
          currentVersionLabel={status.currentVersionLabel}
          approvedVersionLabel={lastApproved?.versionLabel}
          className="h-auto min-h-6 w-fit max-w-full whitespace-normal py-0.5"
        />
      </div>

      {offer.canDecide && request ? (
        <DecisionForm token={token} offer={offer} />
      ) : (
        <p className="text-muted-foreground text-sm">
          {offer.blockedReason ? BLOCKED_COPY[offer.blockedReason] : null}
        </p>
      )}
    </section>
  );
}

function DecisionForm({ token, offer }: { token: string; offer: GuestApprovalOffer }) {
  const { status } = offer;
  const request = status.activeRequest!;
  const uid = useId();
  const [state, action, pending] = useActionState(decideApprovalFromLinkAction, initial);
  const [decision, setDecision] = useState<ApprovalDecision>("approved");

  if (state.status === "success") {
    return (
      <Alert variant="success">
        <CheckCircle2 aria-hidden="true" />
        <AlertTitle>Decision sent</AlertTitle>
        <AlertDescription>
          {state.message} You can close this page, or open the website review to add
          comments.
        </AlertDescription>
      </Alert>
    );
  }

  const nameId = `${uid}-name`;
  const emailId = `${uid}-email`;
  const noteId = `${uid}-note`;

  return (
    <form action={action} className="grid gap-4" noValidate>
      <input type="hidden" name="token" value={token} />
      <input type="hidden" name="deploymentId" value={status.currentDeploymentId} />
      <input type="hidden" name="requestId" value={request.id} />
      <input type="hidden" name="decision" value={decision} />

      <p className="text-sm">
        {request.requesterDisplayName} asked for your decision on{" "}
        <span className="font-medium">{request.versionLabel}</span>. Your decision covers
        this version only.
      </p>
      {request.message ? (
        <p className="rounded-lg bg-muted/40 p-3 text-sm break-words whitespace-pre-wrap ring-1 ring-foreground/10">
          {request.message}
        </p>
      ) : null}

      <ApprovalSummary
        environmentName={status.environmentName}
        versionLabel={request.versionLabel}
        recordedAt={status.currentRecordedAt}
        feedbackDeadline={status.feedbackDeadline}
        issueSummary={{
          openIssueCount: request.openIssueCount,
          awaitingVerificationCount: request.awaitingVerificationCount,
          verifiedIssueCount: request.verifiedIssueCount,
          failedVerificationCount: 0,
        }}
      />
      {hasUnresolvedIssues(status.issueSummary) ? (
        <UnresolvedIssuesWarning summary={status.issueSummary} />
      ) : null}

      {state.status === "error" && state.message ? (
        <Alert variant="destructive">
          <AlertTitle>Couldn’t save your decision</AlertTitle>
          <AlertDescription>
            {state.message}
            {state.needsReload ? (
              <>
                {" "}
                <a className="underline underline-offset-4" href="">
                  Reload this page
                </a>
              </>
            ) : null}
          </AlertDescription>
        </Alert>
      ) : null}

      <fieldset className="grid gap-2">
        <legend className="mb-1 text-sm font-medium">Your decision</legend>
        <RadioGroup
          value={decision}
          onValueChange={(value) => setDecision(value as ApprovalDecision)}
          disabled={pending}
          aria-label="Your decision"
        >
          <div className="flex items-center gap-3">
            <RadioGroupItem id={`${uid}-approve`} value="approved" className="size-5" />
            <Label htmlFor={`${uid}-approve`}>Approve this review</Label>
          </div>
          <div className="flex items-center gap-3">
            <RadioGroupItem
              id={`${uid}-changes`}
              value="changes_requested"
              className="size-5"
            />
            <Label htmlFor={`${uid}-changes`}>Request changes</Label>
          </div>
        </RadioGroup>
      </fieldset>

      <div className="grid gap-2">
        <Label htmlFor={noteId}>
          {decision === "changes_requested" ? "What needs to change?" : "Note (optional)"}
        </Label>
        <Textarea
          id={noteId}
          name="note"
          rows={3}
          maxLength={APPROVAL_NOTE_MAX_LENGTH}
          disabled={pending}
          defaultValue={state.values?.note ?? ""}
          aria-invalid={Boolean(state.fieldErrors?.note)}
          aria-describedby={state.fieldErrors?.note ? `${noteId}-error` : undefined}
        />
        {state.fieldErrors?.note ? (
          <p id={`${noteId}-error`} className="text-destructive text-sm">
            {state.fieldErrors.note}
          </p>
        ) : null}
      </div>

      <div className="grid gap-2">
        <Label htmlFor={nameId}>Name</Label>
        <Input
          id={nameId}
          name="name"
          autoComplete="name"
          required
          disabled={pending}
          defaultValue={state.values?.name ?? ""}
          aria-invalid={Boolean(state.fieldErrors?.name)}
          aria-describedby={state.fieldErrors?.name ? `${nameId}-error` : undefined}
        />
        {state.fieldErrors?.name ? (
          <p id={`${nameId}-error`} className="text-destructive text-sm">
            {state.fieldErrors.name}
          </p>
        ) : null}
      </div>

      <div className="grid gap-2">
        <Label htmlFor={emailId}>Email</Label>
        <Input
          id={emailId}
          name="email"
          type="email"
          autoComplete="email"
          required
          disabled={pending}
          defaultValue={state.values?.email ?? ""}
          aria-invalid={Boolean(state.fieldErrors?.email)}
          aria-describedby={state.fieldErrors?.email ? `${emailId}-error` : undefined}
        />
        {state.fieldErrors?.email ? (
          <p id={`${emailId}-error`} className="text-destructive text-sm">
            {state.fieldErrors.email}
          </p>
        ) : null}
      </div>

      <Button type="submit" disabled={pending} className="min-h-11">
        {pending
          ? "Sending decision…"
          : state.status === "error"
            ? "Try again"
            : decision === "approved"
              ? "Approve this review"
              : "Send change request"}
      </Button>
    </form>
  );
}
