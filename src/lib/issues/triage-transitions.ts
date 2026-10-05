import {
  ISSUE_STATUS_LABELS,
  type IssueStatus,
} from "@/lib/issues/statuses";

export const ISSUE_TRIAGE_CONFLICT_MESSAGE =
  "This issue changed while you were viewing it. Refresh to see the latest details.";

export const ISSUE_TRIAGE_UNAVAILABLE_MESSAGE =
  "This issue isn’t available.";

export const ISSUE_TRIAGE_STATUS_TRANSITIONS = {
  open: "in_progress",
  in_progress: "ready_for_verification",
  ready_for_verification: "in_progress",
} as const satisfies Partial<Record<IssueStatus, IssueStatus>>;

export type TriageableIssueStatus = keyof typeof ISSUE_TRIAGE_STATUS_TRANSITIONS;

export const ISSUE_TRIAGE_PRIMARY_ACTION: Record<
  TriageableIssueStatus,
  { label: string; pendingLabel: string }
> = {
  open: {
    label: "Start work",
    pendingLabel: "Starting work…",
  },
  in_progress: {
    label: "Mark ready for verification",
    pendingLabel: "Marking ready for verification…",
  },
  ready_for_verification: {
    label: "Return to in progress",
    pendingLabel: "Returning to in progress…",
  },
};

export function isTriageableIssueStatus(
  status: IssueStatus,
): status is TriageableIssueStatus {
  return status in ISSUE_TRIAGE_STATUS_TRANSITIONS;
}

export function isAllowedIssueTriageTransition(
  from: IssueStatus,
  to: IssueStatus,
): boolean {
  if (!isTriageableIssueStatus(from)) return false;
  return ISSUE_TRIAGE_STATUS_TRANSITIONS[from] === to;
}

export function issueTriageStatusHint(status: IssueStatus): string | null {
  if (status === "verified") {
    return "Verification requires the reviewer workflow.";
  }
  if (status === "closed") {
    return "Reopening requires the reviewer workflow.";
  }
  return null;
}

export function unsupportedTriageTransitionMessage(
  from: IssueStatus,
  to: IssueStatus,
): string {
  if (from === "verified" || from === "closed" || to === "verified" || to === "closed") {
    return "This issue can’t be updated from here. Verification or reopening needs the reviewer workflow.";
  }
  return `This issue can’t move from ${ISSUE_STATUS_LABELS[from]} to ${ISSUE_STATUS_LABELS[to]} here.`;
}
