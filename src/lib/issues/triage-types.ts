import type { IssuePriority, IssueStatus } from "@/lib/issues/statuses";

export type AssignableMember = {
  userId: string;
  displayName: string;
};

export type IssueTriageSnapshot = {
  version: number;
  status: IssueStatus;
  priority: IssuePriority;
  assigneeUserId: string | null;
  assigneeDisplayName: string;
  updatedAt: string;
};
