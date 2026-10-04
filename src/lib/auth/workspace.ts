import "server-only";

import { and, eq, isNull } from "drizzle-orm";

import { db } from "@/db";
import { workspaceMemberships, workspaces } from "@/db/schema";
import { getActiveMembership } from "@/lib/auth/membership";
import { createUniqueWorkspaceSlug } from "@/lib/auth/slug";

export async function createOwnerWorkspace(options: {
  userId: string;
  workspaceName: string;
}): Promise<
  | { ok: true; workspaceId: string; workspaceName: string }
  | { ok: false; reason: "already_onboarded" | "unavailable" }
> {
  try {
    return await db.transaction(async (tx) => {
      const [existingMembership] = await tx
        .select({ id: workspaceMemberships.id })
        .from(workspaceMemberships)
        .innerJoin(workspaces, eq(workspaces.id, workspaceMemberships.workspaceId))
        .where(
          and(
            eq(workspaceMemberships.userId, options.userId),
            eq(workspaceMemberships.status, "active"),
            isNull(workspaces.deletedAt),
          ),
        )
        .limit(1)
        .for("update");

      if (existingMembership) {
        return { ok: false as const, reason: "already_onboarded" as const };
      }

      const slug = await createUniqueWorkspaceSlug(options.workspaceName, tx);
      const now = new Date();

      const [workspace] = await tx
        .insert(workspaces)
        .values({
          name: options.workspaceName.trim(),
          slug,
          createdAt: now,
          updatedAt: now,
        })
        .returning({ id: workspaces.id, name: workspaces.name });

      await tx.insert(workspaceMemberships).values({
        workspaceId: workspace.id,
        userId: options.userId,
        role: "owner",
        status: "active",
        createdAt: now,
        updatedAt: now,
      });

      return {
        ok: true as const,
        workspaceId: workspace.id,
        workspaceName: workspace.name,
      };
    });
  } catch {
    const membership = await getActiveMembership(options.userId);
    if (membership) {
      return { ok: false, reason: "already_onboarded" };
    }
    return { ok: false, reason: "unavailable" };
  }
}
