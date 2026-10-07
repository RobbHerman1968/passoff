import "server-only";

import { eq } from "drizzle-orm";

import { db } from "@/db";
import { workspaces } from "@/db/schema";
import { PLAN_ENTITLEMENTS } from "@/lib/billing/plans";
import { WORKSPACE_ACTIVITY_TYPES, recordWorkspaceActivity } from "@/lib/workspaces/audit";
import { getMemberCapacity, type MemberCapacity } from "@/lib/workspaces/capacity";
import { loadCallerRole, lockWorkspace } from "@/lib/workspaces/members";
import { can } from "@/lib/workspaces/permissions";
import {
  renameWorkspaceSchema,
  zodFieldErrors,
  type FieldErrors,
} from "@/lib/workspaces/schemas";
import type { WorkspaceContext } from "@/lib/workspaces/context";

export type PlanSummary = {
  planName: string;
  capacity: MemberCapacity;
  activeReviewWebsites: number | "unlimited";
};

export async function getPlanSummary(workspaceId: string): Promise<PlanSummary> {
  const capacity = await getMemberCapacity(workspaceId);
  const plan = PLAN_ENTITLEMENTS[capacity.planId];
  return {
    planName: plan.name,
    capacity,
    activeReviewWebsites: plan.activeReviewWebsites,
  };
}

export type RenameWorkspaceResult =
  | { ok: true; name: string }
  | {
      ok: false;
      error: "forbidden" | "validation" | "unavailable";
      message: string;
      fieldErrors?: FieldErrors;
    };

/** The address people use to open the workspace never changes; only its name does. */
export async function renameWorkspace(
  context: WorkspaceContext,
  input: { name: string },
): Promise<RenameWorkspaceResult> {
  if (!can(context, "workspace.rename")) {
    return { ok: false, error: "forbidden", message: "Only a workspace owner can rename the workspace." };
  }

  const parsed = renameWorkspaceSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: "validation",
      message: "Check the workspace name and try again.",
      fieldErrors: zodFieldErrors(parsed.error),
    };
  }

  try {
    return await db.transaction(async (tx) => {
      const workspace = await lockWorkspace(tx, context.workspaceId);
      const callerRole = await loadCallerRole(tx, context);
      if (!workspace || !can({ role: callerRole }, "workspace.rename")) {
        return {
          ok: false as const,
          error: "forbidden" as const,
          message: "Only a workspace owner can rename the workspace.",
        };
      }
      if (workspace.name === parsed.data.name) {
        return { ok: true as const, name: workspace.name };
      }

      await tx
        .update(workspaces)
        .set({ name: parsed.data.name, updatedAt: new Date() })
        .where(eq(workspaces.id, context.workspaceId));
      await recordWorkspaceActivity(tx, {
        workspaceId: context.workspaceId,
        actorUserId: context.userId,
        type: WORKSPACE_ACTIVITY_TYPES.RENAMED,
        data: { from: workspace.name, to: parsed.data.name },
      });
      return { ok: true as const, name: parsed.data.name };
    });
  } catch {
    return {
      ok: false,
      error: "unavailable",
      message: "We couldn’t rename the workspace. Check your connection and try again.",
    };
  }
}
