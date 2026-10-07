import "server-only";

import type { db } from "@/db";
import { activityEvents } from "@/db/schema";

/**
 * Workspace-level history: who changed the workspace, its people, and its invitations.
 * These rows live in activity_events with no project, review, or issue, so they never
 * show up in an issue's history. They never contain invitation links or tokens.
 */
export const WORKSPACE_ACTIVITY_TYPES = {
  RENAMED: "workspace.renamed",
  INVITATION_SENT: "workspace.invitation_sent",
  INVITATION_RESENT: "workspace.invitation_resent",
  INVITATION_REVOKED: "workspace.invitation_revoked",
  MEMBER_JOINED: "workspace.member_joined",
  MEMBER_REMOVED: "workspace.member_removed",
  MEMBER_LEFT: "workspace.member_left",
  OWNERSHIP_TRANSFERRED: "workspace.ownership_transferred",
  DELETED: "workspace.deleted",
  BILLING_CHECKOUT_COMPLETED: "workspace.billing_checkout_completed",
  BILLING_PLAN_CHANGED: "workspace.billing_plan_changed",
  BILLING_PAYMENT_FAILED: "workspace.billing_payment_failed",
  BILLING_PAYMENT_RECOVERED: "workspace.billing_payment_recovered",
  BILLING_SUBSCRIPTION_ENDED: "workspace.billing_subscription_ended",
} as const;

export type WorkspaceActivityType =
  (typeof WORKSPACE_ACTIVITY_TYPES)[keyof typeof WORKSPACE_ACTIVITY_TYPES];

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Executor = Pick<Transaction, "insert">;

/** Keys that must never be written into workspace history. */
const FORBIDDEN_KEY = /token|secret|password|hash|link|url/i;

export function safeAuditData(
  data: Record<string, unknown>,
): Record<string, unknown> {
  const clean: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    if (FORBIDDEN_KEY.test(key)) continue;
    clean[key] = value;
  }
  return clean;
}

export async function recordWorkspaceActivity(
  executor: Executor,
  input: {
    workspaceId: string;
    actorUserId: string | null;
    type: WorkspaceActivityType;
    data?: Record<string, unknown>;
  },
): Promise<void> {
  await executor.insert(activityEvents).values({
    workspaceId: input.workspaceId,
    actorUserId: input.actorUserId,
    type: input.type,
    data: safeAuditData(input.data ?? {}),
  });
}
