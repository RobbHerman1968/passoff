import "server-only";

import { and, eq, isNull } from "drizzle-orm";

import { db } from "@/db";
import { workspaceMemberships, workspaces } from "@/db/schema";

export type ActiveMembership = {
  membershipId: string;
  workspaceId: string;
  workspaceName: string;
  workspaceSlug: string;
  role: "owner" | "member";
};

export async function getActiveMembership(
  userId: string,
): Promise<ActiveMembership | null> {
  const [row] = await db
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
    .limit(1);

  return row ?? null;
}

export async function userHasActiveMembership(userId: string): Promise<boolean> {
  return Boolean(await getActiveMembership(userId));
}
