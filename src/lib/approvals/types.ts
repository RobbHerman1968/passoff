export type ApprovalRequestState =
  | "awaiting_decision"
  | "approved"
  | "changes_requested"
  | "cancelled"
  | "superseded";

export type ApprovalVisibleState =
  | "not_requested"
  | "awaiting_approval"
  | "approved"
  | "changes_requested"
  | "superseded"
  | "historical_approval";

export type IssueApprovalSummary = {
  openIssueCount: number;
  awaitingVerificationCount: number;
  verifiedIssueCount: number;
  failedVerificationCount: number;
};

export type ApprovalRequestView = {
  id: string;
  state: ApprovalRequestState;
  deploymentId: string;
  versionLabel: string;
  environmentName: string;
  recordedAt: string | null;
  message: string | null;
  dueAt: string | null;
  requestedAt: string;
  completedAt: string | null;
  cancelledAt: string | null;
  unresolvedAcknowledged: boolean;
  openIssueCount: number;
  awaitingVerificationCount: number;
  verifiedIssueCount: number;
  requesterDisplayName: string;
  reviewerDisplayName: string | null;
  decisionNote: string | null;
  /** Who approved or asked for changes. Teammates and guests both appear by name. */
  decidedByDisplayName: string | null;
  historical: boolean;
};

export type ReviewApprovalStatusView = {
  visibleState: ApprovalVisibleState;
  currentDeploymentId: string;
  currentVersionLabel: string;
  currentRecordedAt: string | null;
  environmentName: string;
  activeRequest: ApprovalRequestView | null;
  history: ApprovalRequestView[];
  issueSummary: IssueApprovalSummary;
  feedbackDeadline: string | null;
};

export type ApprovalDecision = "approved" | "changes_requested";

export const APPROVAL_NOTE_MAX_LENGTH = 2_000;

/** Validates the note shared by every kind of reviewer. Pure; safe on client and server. */
export function validateApprovalNote(
  decision: ApprovalDecision,
  rawNote: string | null | undefined,
):
  | { ok: true; note: string | null }
  | { ok: false; message: string } {
  const note = rawNote?.trim() ? rawNote.trim() : null;
  if (decision === "changes_requested" && !note) {
    return {
      ok: false,
      message: "Tell the team what needs to change before requesting changes.",
    };
  }
  if (note && note.length > APPROVAL_NOTE_MAX_LENGTH) {
    return {
      ok: false,
      message: `Keep the note under ${APPROVAL_NOTE_MAX_LENGTH.toLocaleString("en-US")} characters.`,
    };
  }
  return { ok: true, note };
}


/** Compact approval state for lists and exports. */
export type ReviewApprovalSummary = {
  visibleState: ApprovalVisibleState;
  currentVersionLabel: string;
  /** Version of the most recent approval, when one exists. */
  approvedVersionLabel: string | null;
  /** When and by whom the decision behind `visibleState` was made. */
  approvedAt: string | null;
  approvedByDisplayName: string | null;
  decisionNote: string | null;
};

export type ApprovalReviewerOption = {
  userId: string;
  displayName: string;
};

export type GuestApprovalOffer = {
  status: ReviewApprovalStatusView;
  /** True only when this exact link may decide on the version being asked about. */
  canDecide: boolean;
  /** Why this link can’t decide, in terms the page can explain. */
  blockedReason: "view_only" | "no_request" | "someone_else" | "already_decided" | null;
};

