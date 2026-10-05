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
} as const;

export type IssueActivityType =
  (typeof ISSUE_ACTIVITY_TYPES)[keyof typeof ISSUE_ACTIVITY_TYPES];

export const ISSUE_ACTIVITY_TYPE_VALUES = [
  ISSUE_ACTIVITY_TYPES.STATUS_CHANGED,
  ISSUE_ACTIVITY_TYPES.PRIORITY_CHANGED,
  ISSUE_ACTIVITY_TYPES.ASSIGNEE_CHANGED,
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

  return null;
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
