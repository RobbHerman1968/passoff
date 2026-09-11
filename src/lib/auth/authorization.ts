import "server-only";

import { and, asc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { db } from "@/db";
import {
  clientProjects,
  organizationMemberships,
  organizations,
  rooms,
  users,
  workspaceMemberships,
  workspaces,
} from "@/db/schema";
import type { WorkspaceScope } from "@/lib/tenant/context";

export class AuthzError extends Error {
  status: number;
  constructor(message: string, status = 404) {
    super(message);
    this.name = "AuthzError";
    this.status = status;
  }
}

export function authzResponse(error: unknown) {
  if (error instanceof AuthzError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  return null;
}

async function loadUserOrThrow() {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) throw new AuthzError("Unauthorized.", 401);

  const user = (await db.select().from(users).where(eq(users.id, userId)).limit(1))[0];
  if (!user) throw new AuthzError("Unauthorized.", 401);
  return user;
}

/**
 * Resolve the caller's active workspace via membership — never via a shared default slug.
 * Authentication alone never grants access to the seeded workspace.
 */
export async function requireActiveWorkspaceMembership(
  preferredWorkspaceId?: string | null,
): Promise<WorkspaceScope> {
  const user = await loadUserOrThrow();

  const membershipRows = await db
    .select({
      workspaceId: workspaces.id,
      workspaceName: workspaces.name,
      organizationId: organizations.id,
      organizationName: organizations.name,
      membershipRole: workspaceMemberships.role,
      orgStatus: organizationMemberships.status,
      orgRole: organizationMemberships.role,
    })
    .from(workspaceMemberships)
    .innerJoin(workspaces, eq(workspaces.id, workspaceMemberships.workspaceId))
    .innerJoin(organizations, eq(organizations.id, workspaces.organizationId))
    .innerJoin(
      organizationMemberships,
      and(
        eq(organizationMemberships.organizationId, organizations.id),
        eq(organizationMemberships.userId, user.id),
      ),
    )
    .where(eq(workspaceMemberships.userId, user.id))
    .orderBy(asc(workspaceMemberships.createdAt));

  const active = membershipRows.filter((row) => row.orgStatus === "active");
  if (!active.length) {
    throw new AuthzError("No active workspace membership found.", 403);
  }

  const selected =
    (preferredWorkspaceId
      ? active.find((row) => row.workspaceId === preferredWorkspaceId)
      : null) ||
    active.find((row) => row.membershipRole === "owner") ||
    active[0];

  if (!selected) throw new AuthzError("Workspace not found.", 404);

  return {
    organizationId: selected.organizationId,
    organizationName: selected.organizationName,
    workspaceId: selected.workspaceId,
    workspaceName: selected.workspaceName,
    userId: user.id,
    userName: user.name || user.email,
    userEmail: user.email,
  };
}

/** Verify the user is an active member of the workspace that owns this room. Returns 404 on miss. */
export async function requireRoomMembership(roomId: string): Promise<{
  scope: WorkspaceScope;
  room: typeof rooms.$inferSelect;
}> {
  const scope = await requireActiveWorkspaceMembership();
  const room = (
    await db
      .select()
      .from(rooms)
      .where(and(eq(rooms.id, roomId), eq(rooms.workspaceId, scope.workspaceId)))
      .limit(1)
  )[0];
  if (!room) throw new AuthzError("Not found.", 404);
  return { scope, room };
}

/** Verify the user is an active member of the workspace that owns this durable client project. */
export async function requireClientProjectMembership(projectId: string): Promise<{
  scope: WorkspaceScope;
  project: typeof clientProjects.$inferSelect;
}> {
  const scope = await requireActiveWorkspaceMembership();
  const project = (
    await db
      .select()
      .from(clientProjects)
      .where(
        and(
          eq(clientProjects.id, projectId),
          eq(clientProjects.organizationId, scope.organizationId),
          eq(clientProjects.workspaceId, scope.workspaceId),
        ),
      )
      .limit(1)
  )[0];
  if (!project) throw new AuthzError("Not found.", 404);
  return { scope, project };
}

/** True when user has active membership on the workspace. */
export async function userHasWorkspaceAccess(userId: string, workspaceId: string) {
  const row = (
    await db
      .select({ id: workspaceMemberships.id })
      .from(workspaceMemberships)
      .innerJoin(workspaces, eq(workspaces.id, workspaceMemberships.workspaceId))
      .innerJoin(
        organizationMemberships,
        and(
          eq(organizationMemberships.organizationId, workspaces.organizationId),
          eq(organizationMemberships.userId, userId),
          eq(organizationMemberships.status, "active"),
        ),
      )
      .where(
        and(eq(workspaceMemberships.workspaceId, workspaceId), eq(workspaceMemberships.userId, userId)),
      )
      .limit(1)
  )[0];
  return Boolean(row);
}
