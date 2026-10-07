"use client";

import { useRouter } from "next/navigation";
import { History } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { cancelApprovalRequestAction } from "@/app/(app)/projects/approval-actions";
import { ApprovalStatusPill } from "@/components/approvals/approval-status-pill";
import { DecideApprovalDialog } from "@/components/approvals/decide-approval-dialog";
import {
  RequestApprovalDialog,
  type ApprovalGuestLinkOption,
} from "@/components/approvals/request-approval-dialog";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { approvalStateLabel } from "@/lib/approvals/status";
import type {
  ApprovalRequestView,
  ApprovalReviewerOption,
  ReviewApprovalStatusView,
} from "@/lib/approvals/types";
import { formatDeadline } from "@/lib/reviews/deadline-format";

const HISTORY_LIMIT = 5;

function when(iso: string) {
  return (
    <time dateTime={iso} suppressHydrationWarning>
      {formatDeadline(new Date(iso))}
    </time>
  );
}

function historyLine(row: ApprovalRequestView): string {
  switch (row.state) {
    case "approved":
      return `Approved for ${row.versionLabel}`;
    case "changes_requested":
      return `Changes requested on ${row.versionLabel}`;
    case "cancelled":
      return `Request for ${row.versionLabel} cancelled`;
    case "superseded":
      return `Request for ${row.versionLabel} replaced`;
    default:
      return `Waiting for approval on ${row.versionLabel}`;
  }
}

/** Version-bound approval: status, request, decision, and history in one place. */
export function ApprovalPanel({
  projectId,
  reviewId,
  status,
  reviewers,
  approvalLinks,
  canManage,
}: {
  projectId: string;
  reviewId: string;
  status: ReviewApprovalStatusView;
  reviewers: ApprovalReviewerOption[];
  approvalLinks: ApprovalGuestLinkOption[];
  /** Can ask for approval, decide, and cancel. False for read-only reviews. */
  canManage: boolean;
}) {
  const router = useRouter();
  const [cancelError, setCancelError] = useState<string | null>(null);
  const active = status.activeRequest;
  const lastApproved = status.history.find((row) => row.state === "approved");
  const decided = status.history.find(
    (row) =>
      row.deploymentId === status.currentDeploymentId &&
      (row.state === "approved" || row.state === "changes_requested"),
  );
  const historical = status.visibleState === "historical_approval";
  const requestLabel = active
    ? "Replace request"
    : historical || status.visibleState === "approved"
      ? `Ask for approval on ${status.currentVersionLabel}`
      : status.visibleState === "changes_requested"
        ? `Ask again on ${status.currentVersionLabel}`
        : "Ask for approval";

  async function cancel(requestId: string) {
    setCancelError(null);
    try {
      const result = await cancelApprovalRequestAction({ projectId, reviewId, requestId });
      if (!result.ok) {
        setCancelError(result.message);
        return;
      }
      toast.success("Approval request cancelled.");
      router.refresh();
    } catch {
      setCancelError(
        "We couldn’t cancel that request. Check your connection and try again.",
      );
    }
  }

  const issueSummary = status.issueSummary;
  const sharedDialogProps = {
    projectId,
    reviewId,
    environmentName: status.environmentName,
    versionLabel: status.currentVersionLabel,
    recordedAt: status.currentRecordedAt,
    feedbackDeadline: status.feedbackDeadline,
    issueSummary,
  };

  return (
    <section
      aria-labelledby="approval-heading"
      className="rounded-xl border border-border bg-card p-4 text-card-foreground"
      data-testid="approval-panel"
    >
      <h2 id="approval-heading" className="type-section-title">
        Approval
      </h2>
      <div className="mt-3 grid gap-3">
        <ApprovalStatusPill
          state={status.visibleState}
          currentVersionLabel={status.currentVersionLabel}
          approvedVersionLabel={lastApproved?.versionLabel}
          className="h-auto min-h-6 w-fit max-w-full whitespace-normal py-0.5"
        />

        {historical ? (
          <Alert variant="warning">
            <AlertTitle>This approval is from an earlier version</AlertTitle>
            <AlertDescription>
              The site now runs {status.currentVersionLabel}. The earlier approval for{" "}
              {lastApproved?.versionLabel ?? "an older version"} doesn’t cover it. Ask for a
              fresh approval.
            </AlertDescription>
          </Alert>
        ) : null}

        {active ? (
          <div className="grid gap-1 rounded-lg bg-muted/40 p-3 text-sm ring-1 ring-foreground/10">
            <p className="font-medium">Waiting for a decision</p>
            <p className="text-muted-foreground">
              Asked by {active.requesterDisplayName} on {when(active.requestedAt)}
              {active.reviewerDisplayName ? ` · for ${active.reviewerDisplayName}` : ""}
            </p>
            {active.message ? (
              <p className="break-words whitespace-pre-wrap">{active.message}</p>
            ) : null}
          </div>
        ) : null}

        {decided && !active ? (
          <div className="grid gap-1 rounded-lg bg-muted/40 p-3 text-sm ring-1 ring-foreground/10">
            <p className="font-medium">
              {approvalStateLabel({
                state: decided.state === "approved" ? "approved" : "changes_requested",
                currentVersionLabel: decided.versionLabel,
              })}
            </p>
            <p className="text-muted-foreground">
              {decided.decidedByDisplayName ?? "Someone"}
              {decided.completedAt ? <> · {when(decided.completedAt)}</> : null}
            </p>
            {decided.decisionNote ? (
              <p className="break-words whitespace-pre-wrap">{decided.decisionNote}</p>
            ) : null}
            <p className="text-muted-foreground">
              {decided.openIssueCount} open issue{decided.openIssueCount === 1 ? "" : "s"} at
              the time.
            </p>
          </div>
        ) : null}

        {cancelError ? (
          <Alert variant="destructive">
            <AlertTitle>Couldn’t cancel the request</AlertTitle>
            <AlertDescription>{cancelError}</AlertDescription>
          </Alert>
        ) : null}

        {canManage ? (
          <div className="flex flex-wrap gap-2">
            <RequestApprovalDialog
              {...sharedDialogProps}
              reviewers={reviewers}
              approvalLinks={approvalLinks}
              replacesPendingRequest={Boolean(active)}
              triggerLabel={requestLabel}
              triggerVariant={active || decided ? "outline" : "default"}
            />
            {active ? (
              <>
                <DecideApprovalDialog
                  {...sharedDialogProps}
                  deploymentId={status.currentDeploymentId}
                  requestId={active.id}
                  decision="approved"
                />
                <DecideApprovalDialog
                  {...sharedDialogProps}
                  deploymentId={status.currentDeploymentId}
                  requestId={active.id}
                  decision="changes_requested"
                  triggerVariant="outline"
                />
                <ConfirmDialog
                  trigger={<Button type="button" variant="ghost">Cancel request</Button>}
                  title="Cancel this approval request?"
                  description={`The request for ${active.versionLabel} will stop waiting for a decision. You can ask again any time.`}
                  confirmLabel="Cancel request"
                  cancelLabel="Keep waiting"
                  destructive={false}
                  onConfirm={() => void cancel(active.id)}
                />
              </>
            ) : null}
          </div>
        ) : null}

        {status.history.length > 0 ? (
          <div className="grid gap-2 border-t border-border pt-3">
            <h3 className="flex items-center gap-2 text-sm font-medium">
              <History aria-hidden="true" className="size-4" />
              Approval history
            </h3>
            <ul className="grid gap-1.5 text-sm">
              {status.history.slice(0, HISTORY_LIMIT).map((row) => (
                <li key={row.id} className="grid min-w-0 gap-0.5">
                  <span className="break-words">
                    {historyLine(row)}
                    {row.historical && row.state === "approved" ? " (earlier version)" : ""}
                  </span>
                  <span className="text-muted-foreground text-xs">
                    {row.decidedByDisplayName ?? row.requesterDisplayName} ·{" "}
                    {when(row.completedAt ?? row.cancelledAt ?? row.requestedAt)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="text-muted-foreground text-sm">
            Nobody has been asked to approve yet. Approval always belongs to one version of
            the site.
          </p>
        )}
      </div>
    </section>
  );
}
