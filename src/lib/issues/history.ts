import {
  ISSUE_PRIORITY_LABELS,
  ISSUE_STATUS_LABELS,
  type IssuePriority,
  type IssueStatus,
} from "@/lib/issues/statuses";

export const ISSUE_ACTIVITY_TYPES = {
  STATUS_CHANGED: "issue.status_changed",
  PRIORITY_CHANGED: "issue.priority_changed",
  ASSIGNEE_CHANGED: "issue.assignee_changed",
  BEHAVIORAL_ATTACHED: "behavioral_finding.attached",
  COMMENT_ADDED: "issue.comment_added",
  PRIVATE_NOTE_ADDED: "issue.private_note_added",
  LABEL_ADDED: "issue.label_added",
  LABEL_REMOVED: "issue.label_removed",
  VIDEO_ADDED: "issue.video_added",
  VIDEO_REPLACED: "issue.video_replaced",
  VIDEO_REMOVED: "issue.video_removed",
  VIDEO_NEEDS_ATTENTION: "issue.video_needs_attention",
  VIDEO_EXPIRED: "issue.video_expired",
  VIDEO_NOTE_ADDED: "issue.video_note_added",
  PRIVATE_VIDEO_NOTE_ADDED: "issue.private_video_note_added",
} as const;

export type IssueActivityType =
  (typeof ISSUE_ACTIVITY_TYPES)[keyof typeof ISSUE_ACTIVITY_TYPES];

export const ISSUE_ACTIVITY_TYPE_VALUES = [
  ISSUE_ACTIVITY_TYPES.STATUS_CHANGED,
  ISSUE_ACTIVITY_TYPES.PRIORITY_CHANGED,
  ISSUE_ACTIVITY_TYPES.ASSIGNEE_CHANGED,
  ISSUE_ACTIVITY_TYPES.BEHAVIORAL_ATTACHED,
  ISSUE_ACTIVITY_TYPES.COMMENT_ADDED,
  ISSUE_ACTIVITY_TYPES.PRIVATE_NOTE_ADDED,
  ISSUE_ACTIVITY_TYPES.LABEL_ADDED,
  ISSUE_ACTIVITY_TYPES.LABEL_REMOVED,
  ISSUE_ACTIVITY_TYPES.VIDEO_ADDED,
  ISSUE_ACTIVITY_TYPES.VIDEO_REPLACED,
  ISSUE_ACTIVITY_TYPES.VIDEO_REMOVED,
  ISSUE_ACTIVITY_TYPES.VIDEO_NEEDS_ATTENTION,
  ISSUE_ACTIVITY_TYPES.VIDEO_EXPIRED,
  ISSUE_ACTIVITY_TYPES.VIDEO_NOTE_ADDED,
  ISSUE_ACTIVITY_TYPES.PRIVATE_VIDEO_NOTE_ADDED,
] as const;

/** History types safe to show to guest reviewers (never private notes). */
export const GUEST_SAFE_ISSUE_ACTIVITY_TYPES = [
  ISSUE_ACTIVITY_TYPES.STATUS_CHANGED,
  ISSUE_ACTIVITY_TYPES.PRIORITY_CHANGED,
  ISSUE_ACTIVITY_TYPES.ASSIGNEE_CHANGED,
  ISSUE_ACTIVITY_TYPES.BEHAVIORAL_ATTACHED,
  ISSUE_ACTIVITY_TYPES.COMMENT_ADDED,
  ISSUE_ACTIVITY_TYPES.VIDEO_ADDED,
  ISSUE_ACTIVITY_TYPES.VIDEO_REPLACED,
  ISSUE_ACTIVITY_TYPES.VIDEO_REMOVED,
  ISSUE_ACTIVITY_TYPES.VIDEO_EXPIRED,
  ISSUE_ACTIVITY_TYPES.VIDEO_NOTE_ADDED,
] as const;

export type IssueStatusChangedData = {
  from: IssueStatus;
  to: IssueStatus;
};

export type IssuePriorityChangedData = {
  from: IssuePriority;
  to: IssuePriority;
};

export type IssueAssigneeChangedData = {
  fromUserId: string | null;
  toUserId: string | null;
  fromDisplayName: string | null;
  toDisplayName: string | null;
};

export type IssueHistoryEvent = {
  id: string;
  type: IssueActivityType;
  createdAt: string;
  actorDisplayName: string;
  summary: string;
};

const UNKNOWN_ACTOR = "Someone";

export function isIssueActivityType(value: string): value is IssueActivityType {
  return (ISSUE_ACTIVITY_TYPE_VALUES as readonly string[]).includes(value);
}

export function formatIssueHistorySummary(input: {
  type: string;
  actorDisplayName: string | null | undefined;
  data: Record<string, unknown>;
}): string | null {
  const actor = input.actorDisplayName?.trim() || UNKNOWN_ACTOR;

  if (input.type === ISSUE_ACTIVITY_TYPES.STATUS_CHANGED) {
    const from = asIssueStatus(input.data.from);
    const to = asIssueStatus(input.data.to);
    if (!from || !to) return null;
    return `${actor} changed status from ${ISSUE_STATUS_LABELS[from]} to ${ISSUE_STATUS_LABELS[to]}.`;
  }

  if (input.type === ISSUE_ACTIVITY_TYPES.PRIORITY_CHANGED) {
    const to = asIssuePriority(input.data.to);
    if (!to) return null;
    return `${actor} set priority to ${ISSUE_PRIORITY_LABELS[to]}.`;
  }

  if (input.type === ISSUE_ACTIVITY_TYPES.ASSIGNEE_CHANGED) {
    const fromName = optionalName(input.data.fromDisplayName);
    const toName = optionalName(input.data.toDisplayName);
    if (!fromName && toName) {
      return `${actor} assigned this issue to ${toName}.`;
    }
    if (fromName && !toName) {
      return `${actor} removed ${fromName} as the assignee.`;
    }
    if (fromName && toName) {
      return `${actor} reassigned this issue from ${fromName} to ${toName}.`;
    }
    return `${actor} updated the assignee.`;
  }

  if (input.type === ISSUE_ACTIVITY_TYPES.BEHAVIORAL_ATTACHED) {
    return `${actor} attached production behavior evidence to this issue.`;
  }

  if (input.type === ISSUE_ACTIVITY_TYPES.COMMENT_ADDED) {
    return `${actor} added a public reply.`;
  }

  if (input.type === ISSUE_ACTIVITY_TYPES.PRIVATE_NOTE_ADDED) {
    return `${actor} added a private note.`;
  }

  if (input.type === ISSUE_ACTIVITY_TYPES.LABEL_ADDED) {
    const label = optionalName(input.data.labelName);
    return label ? `${actor} added the label “${label}”.` : `${actor} added a label.`;
  }

  if (input.type === ISSUE_ACTIVITY_TYPES.LABEL_REMOVED) {
    const label = optionalName(input.data.labelName);
    return label
      ? `${actor} removed the label “${label}”.`
      : `${actor} removed a label.`;
  }

  if (input.type === ISSUE_ACTIVITY_TYPES.VIDEO_ADDED) {
    return `${actor} added video evidence.`;
  }

  if (input.type === ISSUE_ACTIVITY_TYPES.VIDEO_REPLACED) {
    return `${actor} replaced the video evidence.`;
  }

  if (input.type === ISSUE_ACTIVITY_TYPES.VIDEO_REMOVED) {
    return `${actor} removed the video evidence.`;
  }

  if (input.type === ISSUE_ACTIVITY_TYPES.VIDEO_EXPIRED) {
    return "The video evidence was removed after the retention period.";
  }

  if (
    input.type === ISSUE_ACTIVITY_TYPES.VIDEO_NOTE_ADDED ||
    input.type === ISSUE_ACTIVITY_TYPES.PRIVATE_VIDEO_NOTE_ADDED
  ) {
    const at = formatNoteTime(input.data.timestampMs);
    const kind = input.type === ISSUE_ACTIVITY_TYPES.PRIVATE_VIDEO_NOTE_ADDED ? "private note" : "note";
    return at
      ? `${actor} added a ${kind} on the video at ${at}.`
      : `${actor} added a ${kind} on the video.`;
  }

  if (input.type === ISSUE_ACTIVITY_TYPES.VIDEO_NEEDS_ATTENTION) {
    return `A video added by ${actor} couldn’t be used and needs attention.`;
  }

  return null;
}

function formatNoteTime(value: unknown): string | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return null;
  const total = Math.floor(value / 1_000);
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function optionalName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function asIssueStatus(value: unknown): IssueStatus | null {
  if (typeof value !== "string") return null;
  return value in ISSUE_STATUS_LABELS ? (value as IssueStatus) : null;
}

function asIssuePriority(value: unknown): IssuePriority | null {
  if (typeof value !== "string") return null;
  return value in ISSUE_PRIORITY_LABELS ? (value as IssuePriority) : null;
}
