import type {
  ApprovalRequestState,
  ApprovalVisibleState,
} from "@/lib/approvals/types";

type StateRow = { state: ApprovalRequestState; deploymentId: string };

/**
 * Turns a review's approval history (newest first) into the single state people see.
 * Approval always belongs to a version: an approval for an older version is "historical".
 */
export function deriveApprovalVisibleState(
  history: readonly StateRow[],
  currentDeploymentId: string,
): ApprovalVisibleState {
  const waiting = history.find(
    (row) =>
      row.state === "awaiting_decision" && row.deploymentId === currentDeploymentId,
  );
  if (waiting) return "awaiting_approval";

  const decision = history.find(
    (row) =>
      row.deploymentId === currentDeploymentId &&
      (row.state === "approved" || row.state === "changes_requested"),
  );
  if (decision?.state === "approved") return "approved";
  if (decision?.state === "changes_requested") return "changes_requested";

  if (
    history.some(
      (row) => row.state === "approved" && row.deploymentId !== currentDeploymentId,
    )
  ) {
    return "historical_approval";
  }
  if (history.some((row) => row.state === "superseded")) return "superseded";
  return "not_requested";
}

export type ApprovalPillTone = "neutral" | "ready" | "positive" | "muted" | "open";

export const APPROVAL_STATE_TONE: Record<ApprovalVisibleState, ApprovalPillTone> = {
  not_requested: "neutral",
  awaiting_approval: "ready",
  approved: "positive",
  changes_requested: "open",
  superseded: "muted",
  historical_approval: "muted",
};

/** Plain-language label. Never implies an approval covers a future version. */
export function approvalStateLabel(input: {
  state: ApprovalVisibleState;
  currentVersionLabel: string;
  approvedVersionLabel?: string | null;
}): string {
  switch (input.state) {
    case "awaiting_approval":
      return `Waiting for approval on ${input.currentVersionLabel}`;
    case "approved":
      return `Approved for ${input.currentVersionLabel}`;
    case "changes_requested":
      return `Changes requested on ${input.currentVersionLabel}`;
    case "historical_approval":
      return `Approved for ${input.approvedVersionLabel ?? "an earlier version"}`;
    case "superseded":
      return "Approval request replaced";
    default:
      return "Approval not requested";
  }
}
