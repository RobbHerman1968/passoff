import { StatusPill } from "@/components/status-badge";
import {
  APPROVAL_STATE_TONE,
  approvalStateLabel,
} from "@/lib/approvals/status";
import type { ApprovalVisibleState } from "@/lib/approvals/types";

/** Approval state tied to a version. Words carry the meaning, not just color. */
export function ApprovalStatusPill({
  state,
  currentVersionLabel,
  approvedVersionLabel,
  className,
}: {
  state: ApprovalVisibleState;
  currentVersionLabel: string;
  approvedVersionLabel?: string | null;
  className?: string;
}) {
  return (
    <StatusPill tone={APPROVAL_STATE_TONE[state]} className={className}>
      {approvalStateLabel({ state, currentVersionLabel, approvedVersionLabel })}
    </StatusPill>
  );
}
