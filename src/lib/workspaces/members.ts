import "server-only";

import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";

import { db } from "@/db";
import {
  issues,
  notifications,
  users,
  workspaceMemberships,
  workspaces,
} from "@/db/schema";
import { WORKSPACE_ACTIVITY_TYPES, recordWorkspaceActivity } from "@/lib/workspaces/audit";
import {
  notifyMemberLeft,
  notifyOwnershipTransferred,
} from "@/lib/workspaces/notify";
import { can, type WorkspaceRole } from "@/lib/workspaces/permissions";
import { personDisplayName } from "@/lib/users/display-name";
import type { WorkspaceContext } from "@/lib/workspaces/context";

export type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type MemberSummary = {
  userId: string;
  membershipId: string;
  name: string;
  email: string;
  role: WorkspaceRole;
  joinedAt: Date;
  isYou: boolean;
};

export type MemberFailure =
  | "forbidden"
  | "not_found"
  | "stale"
  | "sole_owner"
  | "unavailable";

export type MemberResult<T extends object = object> =
  | ({ ok: true } & T)
  | { ok: false; error: MemberFailure; message: string };

export const MEMBER_MESSAGES = {
  forbidden: "Only a workspace owner can do this.",
  notFound: "We couldn’t find that person in this workspace. Refresh the page and try again.",
  unavailable: "We couldn’t finish that. Check your connection and try again.",
  cannotRemoveSelf: "You can’t remove yourself here. Use “Leave workspace” in your account settings.",
  cannotRemoveOwner: "The owner can’t be removed. Make someone else the owner first.",
  ownerCannotLeave:
    "You own this workspace. Make someone else the owner before you leave, or delete the workspace.",
} as const;

/** Locks the workspace row so seat counts and ownership changes happen one at a time. */
export async function lockWorkspace(tx: Transaction, workspaceId: string) {
  const [workspace] = await tx
    .select({
      id: workspaces.id,
      name: workspaces.name,
      deletedAt: workspaces.deletedAt,
    })
    .from(workspaces)
    .where(eq(workspaces.id, workspaceId))
    .limit(1)
    .for("update");
  return workspace && !workspace.deletedAt ? workspace : null;
}

/**
 * Reads the caller's role from the database inside the transaction. The role carried by
 * the request context is only a hint; the database decides.
 */
export async function loadCallerRole(
  tx: Transaction,
  context: Pick<WorkspaceContext, "workspaceId" | "userId">,
): Promise<WorkspaceRole | null> {
  const [membership] = await tx
    .select({ role: workspaceMemberships.role })
    .from(workspaceMemberships)
    .where(
      and(
        eq(workspaceMemberships.workspaceId, context.workspaceId),
        eq(workspaceMemberships.userId, context.userId),
        eq(workspaceMemberships.status, "active"),
      ),
    )
    .limit(1)
    .for("update");
  return membership?.role ?? null;
}

export async function listMembers(
  context: WorkspaceContext,
): Promise<MemberResult<{ members: MemberSummary[] }>> {
  if (!can(context, "members.view")) {
    return { ok: false, error: "forbidden", message: MEMBER_MESSAGES.forbidden };
  }

  const rows = await db
    .select({
      userId: users.id,
      membershipId: workspaceMemberships.id,
      name: users.name,
      email: users.email,
      role: workspaceMemberships.role,
      joinedAt: workspaceMemberships.createdAt,
    })
    .from(workspaceMemberships)
    .innerJoin(users, eq(users.id, workspaceMemberships.userId))
    .where(
      and(
        eq(workspaceMemberships.workspaceId, context.workspaceId),
        eq(workspaceMemberships.status, "active"),
        isNull(users.deletedAt),
      ),
    )
    .orderBy(asc(workspaceMemberships.createdAt), asc(workspaceMemberships.id));

  const members = rows
    .map((row) => ({
      userId: row.userId,
      membershipId: row.membershipId,
      name: personDisplayName(row.name, row.email),
      email: row.email,
      role: row.role,
      joinedAt: row.joinedAt,
      isYou: row.userId === context.userId,
    }))
    // The owner always comes first, then people in the order they joined.
    .sort((a, b) => Number(b.role === "owner") - Number(a.role === "owner"));

  return { ok: true, members };
}

/**
 * Takes someone out of a workspace: their access ends, work assigned to them goes back
 * to unassigned, and their notifications for this workspace are cleared. Their comments,
 * issues they raised, and the history of what they did stay exactly as they were.
 */
export async function removeMembershipInTx(
  tx: Transaction,
  input: { workspaceId: string; userId: string },
): Promise<{ removed: boolean; unassignedIssues: number }> {
  const deleted = await tx
    .delete(workspaceMemberships)
    .where(
      and(
        eq(workspaceMemberships.workspaceId, input.workspaceId),
        eq(workspaceMemberships.userId, input.userId),
        eq(workspaceMemberships.role, "member"),
      ),
    )
    .returning({ id: workspaceMemberships.id });
  if (deleted.length === 0) return { removed: false, unassignedIssues: 0 };

  const assigned = await tx
    .select({ id: issues.id })
    .from(issues)
    .where(
      and(
        eq(issues.workspaceId, input.workspaceId),
        eq(issues.assigneeUserId, input.userId),
      ),
    );
  const issueIds = assigned.map((row) => row.id);
  if (issueIds.length > 0) {
    await tx
      .update(issues)
      .set({
        assigneeUserId: null,
        version: sql`${issues.version} + 1`,
        updatedAt: new Date(),
      })
      .where(
        and(eq(issues.workspaceId, input.workspaceId), inArray(issues.id, issueIds)),
      );
  }

  await tx
    .delete(notifications)
    .where(
      and(
        eq(notifications.recipientUserId, input.userId),
        eq(notifications.workspaceId, input.workspaceId),
      ),
    );

  return { removed: true, unassignedIssues: issueIds.length };
}

async function loadMemberIdentity(tx: Transaction, workspaceId: string, userId: string) {
  const [row] = await tx
    .select({
      userId: users.id,
      name: users.name,
      email: users.email,
      role: workspaceMemberships.role,
    })
    .from(workspaceMemberships)
    .innerJoin(users, eq(users.id, workspaceMemberships.userId))
    .where(
      and(
        eq(workspaceMemberships.workspaceId, workspaceId),
        eq(workspaceMemberships.userId, userId),
        eq(workspaceMemberships.status, "active"),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function removeMember(
  context: WorkspaceContext,
  input: { memberUserId: string },
): Promise<MemberResult<{ memberName: string; unassignedIssues: number }>> {
  if (!can(context, "members.remove")) {
    return { ok: false, error: "forbidden", message: MEMBER_MESSAGES.forbidden };
  }

  try {
    return await db.transaction(async (tx) => {
      const workspace = await lockWorkspace(tx, context.workspaceId);
      if (!workspace) {
        return { ok: false as const, error: "not_found" as const, message: MEMBER_MESSAGES.notFound };
      }
      const callerRole = await loadCallerRole(tx, context);
      if (!can({ role: callerRole }, "members.remove")) {
        return { ok: false as const, error: "forbidden" as const, message: MEMBER_MESSAGES.forbidden };
      }
      if (input.memberUserId === context.userId) {
        return { ok: false as const, error: "sole_owner" as const, message: MEMBER_MESSAGES.cannotRemoveSelf };
      }

      const target = await loadMemberIdentity(tx, context.workspaceId, input.memberUserId);
      if (!target) {
        return { ok: false as const, error: "not_found" as const, message: MEMBER_MESSAGES.notFound };
      }
      if (target.role === "owner") {
        return { ok: false as const, error: "sole_owner" as const, message: MEMBER_MESSAGES.cannotRemoveOwner };
      }

      const { unassignedIssues } = await removeMembershipInTx(tx, {
        workspaceId: context.workspaceId,
        userId: target.userId,
      });
      const memberName = personDisplayName(target.name, target.email);
      await recordWorkspaceActivity(tx, {
        workspaceId: context.workspaceId,
        actorUserId: context.userId,
        type: WORKSPACE_ACTIVITY_TYPES.MEMBER_REMOVED,
        data: { memberUserId: target.userId, memberName, unassignedIssues },
      });
      return { ok: true as const, memberName, unassignedIssues };
    });
  } catch {
    return { ok: false, error: "unavailable", message: MEMBER_MESSAGES.unavailable };
  }
}

/** A member leaves on their own. The owner cannot leave without handing over ownership. */
export async function leaveWorkspace(
  context: WorkspaceContext,
): Promise<MemberResult<{ workspaceName: string }>> {
  if (!can(context, "workspace.leave")) {
    return { ok: false, error: "forbidden", message: MEMBER_MESSAGES.forbidden };
  }

  try {
    const outcome = await db.transaction(async (tx) => {
      const workspace = await lockWorkspace(tx, context.workspaceId);
      if (!workspace) {
        return { ok: false as const, error: "not_found" as const, message: MEMBER_MESSAGES.notFound };
      }
      const callerRole = await loadCallerRole(tx, context);
      if (!callerRole) {
        return { ok: false as const, error: "not_found" as const, message: MEMBER_MESSAGES.notFound };
      }
      if (callerRole === "owner") {
        return { ok: false as const, error: "sole_owner" as const, message: MEMBER_MESSAGES.ownerCannotLeave };
      }

      const { unassignedIssues } = await removeMembershipInTx(tx, {
        workspaceId: context.workspaceId,
        userId: context.userId,
      });
      await recordWorkspaceActivity(tx, {
        workspaceId: context.workspaceId,
        actorUserId: context.userId,
        type: WORKSPACE_ACTIVITY_TYPES.MEMBER_LEFT,
        data: {
          memberUserId: context.userId,
          memberName: personDisplayName(context.userName, context.userEmail),
          unassignedIssues,
        },
      });
      return { ok: true as const, workspaceName: workspace.name };
    });

    if (outcome.ok) {
      await notifyMemberLeft(context).catch(() => undefined);
    }
    return outcome;
  } catch {
    return { ok: false, error: "unavailable", message: MEMBER_MESSAGES.unavailable };
  }
}

/**
 * Hands ownership to another active member. The old owner becomes a member in the same
 * transaction, so the workspace always has exactly one owner and never zero.
 */
export async function transferOwnership(
  context: WorkspaceContext,
  input: { newOwnerUserId: string },
): Promise<MemberResult<{ newOwnerName: string }>> {
  if (!can(context, "ownership.transfer")) {
    return { ok: false, error: "forbidden", message: MEMBER_MESSAGES.forbidden };
  }

  try {
    const outcome = await db.transaction(async (tx) => {
      const workspace = await lockWorkspace(tx, context.workspaceId);
      if (!workspace) {
        return { ok: false as const, error: "not_found" as const, message: MEMBER_MESSAGES.notFound };
      }
      const callerRole = await loadCallerRole(tx, context);
      if (!can({ role: callerRole }, "ownership.transfer")) {
        return { ok: false as const, error: "forbidden" as const, message: MEMBER_MESSAGES.forbidden };
      }
      if (input.newOwnerUserId === context.userId) {
        return {
          ok: false as const,
          error: "stale" as const,
          message: "You already own this workspace. Choose someone else.",
        };
      }

      const target = await loadMemberIdentity(tx, context.workspaceId, input.newOwnerUserId);
      if (!target) {
        return { ok: false as const, error: "not_found" as const, message: MEMBER_MESSAGES.notFound };
      }

      const now = new Date();
      // Demote first: only one active owner may exist at any moment.
      await tx
        .update(workspaceMemberships)
        .set({ role: "member", updatedAt: now })
        .where(
          and(
            eq(workspaceMemberships.workspaceId, context.workspaceId),
            eq(workspaceMemberships.userId, context.userId),
            eq(workspaceMemberships.role, "owner"),
          ),
        );
      await tx
        .update(workspaceMemberships)
        .set({ role: "owner", updatedAt: now })
        .where(
          and(
            eq(workspaceMemberships.workspaceId, context.workspaceId),
            eq(workspaceMemberships.userId, target.userId),
            eq(workspaceMemberships.status, "active"),
          ),
        );

      const newOwnerName = personDisplayName(target.name, target.email);
      await recordWorkspaceActivity(tx, {
        workspaceId: context.workspaceId,
        actorUserId: context.userId,
        type: WORKSPACE_ACTIVITY_TYPES.OWNERSHIP_TRANSFERRED,
        data: {
          fromUserId: context.userId,
          fromName: personDisplayName(context.userName, context.userEmail),
          toUserId: target.userId,
          toName: newOwnerName,
        },
      });
      return { ok: true as const, newOwnerName, newOwnerUserId: target.userId };
    });

    if (outcome.ok) {
      await notifyOwnershipTransferred(context, outcome.newOwnerUserId).catch(
        () => undefined,
      );
      return { ok: true, newOwnerName: outcome.newOwnerName };
    }
    return outcome;
  } catch {
    return { ok: false, error: "unavailable", message: MEMBER_MESSAGES.unavailable };
  }
}
