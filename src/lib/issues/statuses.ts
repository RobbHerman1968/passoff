export const ISSUE_STATUSES = [
  "open",
  "in_progress",
  "ready_for_verification",
  "verified",
  "closed",
] as const;
export type IssueStatus = (typeof ISSUE_STATUSES)[number];

export const ISSUE_STATUS_LABELS: Record<IssueStatus, string> = {
  open: "Open",
  in_progress: "In progress",
  ready_for_verification: "Ready for verification",
  verified: "Verified",
  closed: "Closed",
};

export const ISSUE_PRIORITIES = ["low", "normal", "high", "urgent"] as const;
export type IssuePriority = (typeof ISSUE_PRIORITIES)[number];

export const ISSUE_PRIORITY_LABELS: Record<IssuePriority, string> = {
  low: "Low",
  normal: "Normal",
  high: "High",
  urgent: "Urgent",
};

export const ISSUE_CLOSURE_REASONS = [
  "fixed",
  "not_planned",
  "duplicate",
  "cannot_reproduce",
  "no_longer_relevant",
] as const;
export type IssueClosureReason = (typeof ISSUE_CLOSURE_REASONS)[number];

export const ISSUE_CLOSURE_REASON_LABELS: Record<IssueClosureReason, string> = {
  fixed: "Fixed",
  not_planned: "Not planned",
  duplicate: "Duplicate",
  cannot_reproduce: "Cannot reproduce",
  no_longer_relevant: "No longer relevant",
};

export const OPEN_ISSUE_STATUSES = [
  "open",
  "in_progress",
  "ready_for_verification",
] as const;

export const LEGACY_ISSUE_STATUS_MAP = {
  open: { status: "open", closureReason: null },
  in_progress: { status: "in_progress", closureReason: null },
  ready_for_review: { status: "ready_for_verification", closureReason: null },
  resolved: { status: "ready_for_verification", closureReason: null },
  not_planned: { status: "closed", closureReason: "not_planned" },
} as const;
