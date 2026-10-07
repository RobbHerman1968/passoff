import "server-only";

import { and, asc, eq, isNull } from "drizzle-orm";

import { db } from "@/db";
import { workspaceMemberships, workspaces } from "@/db/schema";

export type ActiveMembership = {
  membershipId: string;
  workspaceId: string;
  workspaceName: string;
  workspaceSlug: string;
  role: "owner" | "member";
};

/** Every workspace this person can open, oldest membership first. */
export async function listUserWorkspaces(
  userId: string,
): Promise<ActiveMembership[]> {
  return db
    .select({
      membershipId: workspaceMemberships.id,
      workspaceId: workspaces.id,
      workspaceName: workspaces.name,
      workspaceSlug: workspaces.slug,
      role: workspaceMemberships.role,
    })
    .from(workspaceMemberships)
    .innerJoin(workspaces, eq(workspaces.id, workspaceMemberships.workspaceId))
    .where(
      and(
        eq(workspaceMemberships.userId, userId),
        eq(workspaceMemberships.status, "active"),
        isNull(workspaces.deletedAt),
      ),
    )
    .orderBy(asc(workspaceMemberships.createdAt), asc(workspaceMemberships.id));
}

/**
 * The workspace to work in. A remembered choice wins only while the person is still an
 * active member of a workspace that has not been deleted; otherwise the oldest
 * membership is used so the answer is always the same one.
 */
export async function getActiveMembership(
  userId: string,
  preferredWorkspaceId?: string | null,
): Promise<ActiveMembership | null> {
  const memberships = await listUserWorkspaces(userId);
  if (preferredWorkspaceId) {
    const preferred = memberships.find(
      (membership) => membership.workspaceId === preferredWorkspaceId,
    );
    if (preferred) return preferred;
  }
  return memberships[0] ?? null;
}

export async function userHasActiveMembership(userId: string): Promise<boolean> {
  return Boolean(await getActiveMembership(userId));
}
