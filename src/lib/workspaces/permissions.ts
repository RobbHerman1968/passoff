import { canDeleteProjects, canMutateProjects } from "@/lib/projects/permissions";

/**
 * The one place that says what each workspace role may do.
 *
 * Roles are Owner and Member. Nothing else exists. Every server action and service
 * checks this table before it changes anything; hiding a button is only a courtesy.
 * Keep the table in step with section 12 of docs/UI_APP_GUIDELINES.md.
 */
export type WorkspaceRole = "owner" | "member";

export type WorkspaceAction =
  | "project.mutate"
  | "project.delete"
  | "members.view"
  | "members.invite"
  | "members.remove"
  | "invitations.manage"
  | "ownership.transfer"
  | "workspace.rename"
  | "workspace.delete"
  | "workspace.plan.view"
  | "billing.manage"
  | "workspace.leave"
  | "webhooks.manage";

const OWNER_ONLY: ReadonlySet<WorkspaceAction> = new Set<WorkspaceAction>([
  "project.delete",
  "members.invite",
  "members.remove",
  "invitations.manage",
  "ownership.transfer",
  "workspace.rename",
  "workspace.delete",
  "webhooks.manage",
  "billing.manage",
]);

const EVERY_MEMBER: ReadonlySet<WorkspaceAction> = new Set<WorkspaceAction>([
  "project.mutate",
  "members.view",
  "workspace.plan.view",
  "workspace.leave",
]);

export function can(
  subject: { role: WorkspaceRole | null | undefined },
  action: WorkspaceAction,
): boolean {
  if (subject.role === "owner") {
    return OWNER_ONLY.has(action) || EVERY_MEMBER.has(action);
  }
  if (subject.role === "member") {
    return EVERY_MEMBER.has(action);
  }
  return false;
}

/** Actions only an owner can take. Used by tests that prove every one is refused. */
export const OWNER_ONLY_ACTIONS: readonly WorkspaceAction[] = [...OWNER_ONLY];

export function canInviteMembers(subject: { role: WorkspaceRole }) {
  return can(subject, "members.invite");
}

export function canRemoveMembers(subject: { role: WorkspaceRole }) {
  return can(subject, "members.remove");
}

export function canManageInvitations(subject: { role: WorkspaceRole }) {
  return can(subject, "invitations.manage");
}

export function canTransferOwnership(subject: { role: WorkspaceRole }) {
  return can(subject, "ownership.transfer");
}

export function canRenameWorkspace(subject: { role: WorkspaceRole }) {
  return can(subject, "workspace.rename");
}

export function canDeleteWorkspace(subject: { role: WorkspaceRole }) {
  return can(subject, "workspace.delete");
}

/** Starting a plan, opening the Billing Portal. Members can only see usage and plan. */
export function canManageBilling(subject: { role: WorkspaceRole }) {
  return can(subject, "billing.manage");
}

export function canManageWebhooks(subject: { role: WorkspaceRole }) {
  return can(subject, "webhooks.manage");
}

// Project permissions stay in one file and are re-exported so callers have one import.
export { canDeleteProjects, canMutateProjects };
