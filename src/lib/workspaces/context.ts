import "server-only";

import { getValidSession } from "@/auth";
import {
  getActiveMembership,
  type ActiveMembership,
} from "@/lib/auth/membership";
import { readPreferredWorkspaceId } from "@/lib/workspaces/active-workspace";

export type WorkspaceContext = ActiveMembership & {
  userId: string;
  userName: string | null;
  userEmail: string | null;
};

export type WorkspaceContextResult =
  | { ok: true; context: WorkspaceContext }
  | { ok: false; reason: "unauthenticated" | "no_membership" };

/**
 * Resolve an authenticated user with an active workspace membership.
 * Product queries must use this before workspace-scoped work.
 *
 * The workspace is the one the person chose in this browser, re-checked against their
 * memberships on every call. A forged, stale, or removed choice falls back to their
 * oldest membership, so it can never open a workspace they do not belong to.
 */
export async function requireWorkspaceContext(): Promise<WorkspaceContextResult> {
  const session = await getValidSession();
  if (!session?.user?.id) {
    return { ok: false, reason: "unauthenticated" };
  }

  const preferredWorkspaceId = await readPreferredWorkspaceId(session.user.id);
  const membership = await getActiveMembership(
    session.user.id,
    preferredWorkspaceId,
  );
  if (!membership) {
    return { ok: false, reason: "no_membership" };
  }

  return {
    ok: true,
    context: {
      ...membership,
      userId: session.user.id,
      userName: session.user.name ?? null,
      userEmail: session.user.email ?? null,
    },
  };
}

export {
  canDeleteProjects,
  canMutateProjects,
} from "@/lib/projects/permissions";
