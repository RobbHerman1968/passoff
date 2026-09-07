export const PROJECT_STATUSES = [
  "DRAFT",
  "SENT",
  "VIEWED",
  "CHANGES_REQUESTED",
  "APPROVED",
  "ARCHIVED",
] as const;

export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export const REVISION_STATUSES = ["DRAFT", "PUBLISHED", "SUPERSEDED", "APPROVED"] as const;
export type RevisionStatus = (typeof REVISION_STATUSES)[number];

export const COMMENT_STATUSES = ["OPEN", "RESOLVED", "WONT_FIX"] as const;
export type CommentStatus = (typeof COMMENT_STATUSES)[number];

export const DEFAULT_APPROVAL_STATEMENT =
  "I approve this revision of the project as complete and ready for delivery. Further changes will require a new revision.";

export function isProjectStatus(value: string): value is ProjectStatus {
  return (PROJECT_STATUSES as readonly string[]).includes(value);
}
