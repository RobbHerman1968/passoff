"use client";

import { useRouter } from "next/navigation";

import { useIssueTriage } from "@/components/issues/issue-triage-context";
import { Button } from "@/components/ui/button";
import {
  ISSUE_TRIAGE_CONFLICT_MESSAGE,
  ISSUE_TRIAGE_PRIMARY_ACTION,
  isTriageableIssueStatus,
  issueTriageStatusHint,
} from "@/lib/issues/triage-transitions";

export function IssueStatusAction() {
  const router = useRouter();
  const { snapshot, savingField, fieldError, online, updateStatus, retryFailed } =
    useIssueTriage();
  const hint = issueTriageStatusHint(snapshot.status);
  const busy = savingField === "status";
  const action = isTriageableIssueStatus(snapshot.status)
    ? ISSUE_TRIAGE_PRIMARY_ACTION[snapshot.status]
    : null;
  const statusError = fieldError?.field === "status" ? fieldError.message : null;
  const isConflict = statusError === ISSUE_TRIAGE_CONFLICT_MESSAGE;

  return (
    <div className="grid min-w-0 justify-items-stretch gap-2 sm:justify-items-end">
      {action ? (
        <Button
          type="button"
          onClick={() => void updateStatus()}
          disabled={busy || !online}
          aria-busy={busy || undefined}
        >
          {busy ? action.pendingLabel : action.label}
        </Button>
      ) : null}
      {hint ? (
        <p className="max-w-sm text-sm text-muted-foreground">{hint}</p>
      ) : null}
      {busy ? (
        <p className="sr-only" role="status" aria-live="polite">
          {action?.pendingLabel}
        </p>
      ) : null}
      {statusError ? (
        <div className="max-w-sm" role="alert">
          <p className="text-sm text-destructive">{statusError}</p>
          <Button
            type="button"
            variant="outline"
            className="mt-2"
            onClick={() => {
              if (isConflict) {
                router.refresh();
                return;
              }
              void retryFailed();
            }}
          >
            {isConflict ? "Refresh" : "Try again"}
          </Button>
        </div>
      ) : null}
      {!online ? (
        <p className="max-w-sm text-sm text-muted-foreground">
          You’re offline. Status can be updated when you’re back online.
        </p>
      ) : null}
    </div>
  );
}
