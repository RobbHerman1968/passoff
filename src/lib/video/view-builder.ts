import { userMessageForVideoFailure } from "@/lib/video/failure-reasons";
import {
  displayStateFor,
  isWorkingState,
  retentionViewFor,
  viewNeedsPolling,
  type IssueVideoView,
  type VideoEvidenceView,
  type VideoTombstoneView,
  type VideoUploadAction,
  type VideoUsageView,
} from "@/lib/video/states";

export type VideoRowForView = {
  id: string;
  lifecycle: string;
  processingStatus: string;
  failureReason: string | null;
  durationMs: number | null;
  createdAt: Date;
  removedAt: Date | null;
  removalReason: string | null;
  providerDeletedAt: Date | null;
  retentionEndsAt?: Date | null;
  uploadedByName: string | null;
  removedByName: string | null;
};

export const VIDEO_BLOCKED_MESSAGES = {
  archived:
    "This review is archived, so video evidence can’t be changed. Restore it to make changes.",
  closed: "Reopen this issue before adding or replacing video evidence.",
  busy: "A video is already being added. Let it finish, or cancel it first.",
  monthly:
    "This workspace has used its new video time for the month. Ask your workspace owner to change plans, or try again next month.",
  retained:
    "This workspace is keeping as much video as its plan includes. Remove video evidence you no longer need, or ask your workspace owner to change plans.",
  unavailable: "Video evidence isn’t available on this plan yet.",
  notMember: "Only people in this workspace can add video evidence.",
} as const;

function toEvidenceView(
  row: VideoRowForView,
  role: "current" | "replacement",
  now: Date,
): VideoEvidenceView {
  const state = displayStateFor(row, now);
  let message: string | null = null;
  if (state === "needs_attention" || state === "failed") {
    message = userMessageForVideoFailure(
      row.processingStatus === "pending" || row.processingStatus === "uploading"
        ? "upload_failed"
        : row.failureReason,
    );
  }
  return {
    videoAssetId: row.id,
    role,
    state,
    durationSeconds: row.durationMs == null ? null : row.durationMs / 1_000,
    message,
    createdAt: row.createdAt.toISOString(),
    uploadedByName: row.uploadedByName,
  };
}

function toTombstone(row: VideoRowForView): VideoTombstoneView | null {
  if (!row.removedAt) return null;
  const reason =
    row.removalReason === "retention_expired"
      ? "expired"
      : row.removalReason === "replaced"
        ? "replaced"
        : "removed";
  return {
    videoAssetId: row.id,
    removedAt: row.removedAt.toISOString(),
    removedByName: row.removedByName,
    reason,
    cleanupPending: row.providerDeletedAt == null,
  };
}

const TOMBSTONE_REASONS = new Set([
  "deleted_by_member",
  "retention_expired",
  "project_deleted",
]);

export function buildIssueVideoView(input: {
  issueId: string;
  /** Rows for this issue, newest first. */
  rows: VideoRowForView[];
  issueClosed: boolean;
  archived: boolean;
  canManage: boolean;
  usage: VideoUsageView | null;
  /** False when the plan has no approved video allowance. */
  limitsApproved: boolean;
  now?: Date;
}): IssueVideoView {
  const now = input.now ?? new Date();
  const currentRow = input.rows.find((row) => row.lifecycle === "current") ?? null;
  const replacementRow = input.rows.find((row) => row.lifecycle === "replacement") ?? null;

  const current = currentRow ? toEvidenceView(currentRow, "current", now) : null;
  const replacement = replacementRow ? toEvidenceView(replacementRow, "replacement", now) : null;

  let tombstone: VideoTombstoneView | null = null;
  if (!current) {
    const removed = input.rows.find(
      (row) =>
        row.lifecycle === "removed" &&
        row.removalReason != null &&
        TOMBSTONE_REASONS.has(row.removalReason),
    );
    tombstone = removed ? toTombstone(removed) : null;
  }

  const working = [current, replacement].some((item) => item && isWorkingState(item.state));
  const mode: "add" | "replace" = current?.state === "ready" ? "replace" : "add";

  let blockedReason: string | null = null;
  if (!input.canManage) blockedReason = VIDEO_BLOCKED_MESSAGES.notMember;
  else if (input.archived) blockedReason = VIDEO_BLOCKED_MESSAGES.archived;
  else if (!input.limitsApproved) blockedReason = VIDEO_BLOCKED_MESSAGES.unavailable;
  else if (input.issueClosed) blockedReason = VIDEO_BLOCKED_MESSAGES.closed;
  else if (working) blockedReason = VIDEO_BLOCKED_MESSAGES.busy;
  else if (input.usage) {
    if (input.usage.newMinutesUsed >= input.usage.newMinutesAllowed) {
      blockedReason = VIDEO_BLOCKED_MESSAGES.monthly;
    } else if (
      mode === "add" &&
      input.usage.retainedMinutesUsed >= input.usage.retainedMinutesAllowed
    ) {
      blockedReason = VIDEO_BLOCKED_MESSAGES.retained;
    }
  }

  const action: VideoUploadAction = {
    canUpload: blockedReason == null,
    mode,
    blockedReason,
  };

  const view: IssueVideoView = {
    issueId: input.issueId,
    current,
    replacement,
    tombstone,
    action,
    usage: input.usage,
    canManage: input.canManage,
    archived: input.archived,
    retention:
      current?.state === "ready"
        ? retentionViewFor(input.issueClosed ? (currentRow?.retentionEndsAt ?? null) : null, now)
        : null,
    needsPolling: false,
  };
  view.needsPolling = viewNeedsPolling(view);
  return view;
}
