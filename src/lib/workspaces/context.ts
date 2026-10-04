import "server-only";

import { getValidSession } from "@/auth";
import {
  getActiveMembership,
  type ActiveMembership,
} from "@/lib/auth/membership";

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
 */
export async function requireWorkspaceContext(): Promise<WorkspaceContextResult> {
  const session = await getValidSession();
  if (!session?.user?.id) {
    return { ok: false, reason: "unauthenticated" };
  }

  const membership = await getActiveMembership(session.user.id);
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
