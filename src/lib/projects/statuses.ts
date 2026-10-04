export const PROJECT_STATUSES = ["active", "archived"] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = {
  active: "Active",
  archived: "Archived",
};

export const REVIEW_STATUSES = ["draft", "open", "closed"] as const;
export type ReviewStatus = (typeof REVIEW_STATUSES)[number];

export const REVIEW_STATUS_LABELS: Record<ReviewStatus, string> = {
  draft: "Draft",
  open: "Open",
  closed: "Closed",
};

export const ENVIRONMENT_KINDS = [
  "preview",
  "staging",
  "production",
  "custom",
] as const;
export type EnvironmentKind = (typeof ENVIRONMENT_KINDS)[number];

export const ENVIRONMENT_KIND_LABELS: Record<EnvironmentKind, string> = {
  preview: "Preview",
  staging: "Staging",
  production: "Production",
  custom: "Custom",
};

export const OPEN_ISSUE_STATUSES = [
  "open",
  "in_progress",
  "ready_for_verification",
] as const;
