import "server-only";

import { and, eq, inArray, isNotNull, isNull, lte } from "drizzle-orm";

import { db } from "@/db";
import {
  projectEnvironments,
  reviewSessions,
  shareLinks,
  users,
  videoAssets,
  webhookDeliveries,
  webhookEndpoints,
  workspaceInvitations,
  workspaceMemberships,
  workspaces,
} from "@/db/schema";
import { sendEmail } from "@/lib/email";
import { personDisplayName } from "@/lib/users/display-name";
import { retireVideoRow, type RemovableVideoRow } from "@/lib/video/lifecycle";
import { deleteProviderCopyNow } from "@/lib/video/provider-deletion";
import { WORKSPACE_ACTIVITY_TYPES, recordWorkspaceActivity } from "@/lib/workspaces/audit";
import {
  loadCallerRole,
  type Transaction,
} from "@/lib/workspaces/members";
import { can } from "@/lib/workspaces/permissions";
import { WORKSPACE_PURGE_DELAY_DAYS } from "@/lib/workspaces/schemas";
import type { WorkspaceContext } from "@/lib/workspaces/context";

const DAY_MS = 24 * 60 * 60 * 1000;

export const WORKSPACE_DELETE_MESSAGES = {
  forbidden: "Only a workspace owner can delete the workspace.",
  confirmMismatch: "Type the workspace name exactly as shown to confirm.",
  stale:
    "This page is out of date. Refresh it and make sure you’re deleting the workspace you meant to.",
  unavailable: "We couldn’t delete the workspace. Check your connection and try again.",
} as const;

export type DeleteWorkspaceResult =
  | { ok: true; alreadyDeleted: boolean; workspaceName: string; purgeAfter: Date }
  | {
      ok: false;
      error: "forbidden" | "confirm_mismatch" | "stale" | "unavailable";
      message: string;
    };

export type DeletedWorkspaceTail = {
  workspaceId: string;
  workspaceName: string;
  actorName: string;
  videos: RemovableVideoRow[];
  emails: string[];
};

/**
 * Closes a workspace to everyone, inside the caller's transaction:
 *  - the workspace is marked deleted, so no member can open it any more
 *  - open invitations, guest links, and guest sessions stop working
 *  - website installs stop collecting feedback, and webhooks stop sending
 *  - stored video is queued for deletion at the video provider
 * Everything stays in the database until the cleanup date so nothing is removed before
 * stored files are confirmed gone. Safe to repeat.
 */
export async function closeWorkspaceInTx(
  tx: Transaction,
  input: { workspaceId: string; actorUserId: string; now: Date },
): Promise<{ alreadyDeleted: boolean; purgeAfter: Date; tail: DeletedWorkspaceTail } | null> {
  const [workspace] = await tx
    .select({
      id: workspaces.id,
      name: workspaces.name,
      deletedAt: workspaces.deletedAt,
      purgeAfter: workspaces.purgeAfter,
    })
    .from(workspaces)
    .where(eq(workspaces.id, input.workspaceId))
    .limit(1)
    .for("update");
  if (!workspace) return null;

  const [actor] = await tx
    .select({ name: users.name, email: users.email })
    .from(users)
    .where(eq(users.id, input.actorUserId))
    .limit(1);
  const actorName = actor ? personDisplayName(actor.name, actor.email) : "A workspace owner";

  const emptyTail: DeletedWorkspaceTail = {
    workspaceId: workspace.id,
    workspaceName: workspace.name,
    actorName,
    videos: [],
    emails: [],
  };

  if (workspace.deletedAt) {
    return {
      alreadyDeleted: true,
      purgeAfter:
        workspace.purgeAfter ??
        new Date(workspace.deletedAt.getTime() + WORKSPACE_PURGE_DELAY_DAYS * DAY_MS),
      tail: emptyTail,
    };
  }

  const { now } = input;
  const purgeAfter = new Date(now.getTime() + WORKSPACE_PURGE_DELAY_DAYS * DAY_MS);

  const memberRows = await tx
    .select({ email: users.email, userId: users.id })
    .from(workspaceMemberships)
    .innerJoin(users, eq(users.id, workspaceMemberships.userId))
    .where(
      and(
        eq(workspaceMemberships.workspaceId, workspace.id),
        eq(workspaceMemberships.status, "active"),
        isNull(users.deletedAt),
      ),
    );

  await tx
    .update(workspaces)
    .set({
      deletedAt: now,
      deletedByUserId: input.actorUserId,
      purgeAfter,
      updatedAt: now,
    })
    .where(eq(workspaces.id, workspace.id));

  await tx
    .update(workspaceInvitations)
    .set({ revokedAt: now })
    .where(
      and(
        eq(workspaceInvitations.workspaceId, workspace.id),
        isNull(workspaceInvitations.acceptedAt),
        isNull(workspaceInvitations.revokedAt),
      ),
    );

  await tx
    .update(shareLinks)
    .set({ revokedAt: now, updatedAt: now })
    .where(and(eq(shareLinks.workspaceId, workspace.id), isNull(shareLinks.revokedAt)));
  await tx
    .update(reviewSessions)
    .set({ revokedAt: now })
    .where(and(eq(reviewSessions.workspaceId, workspace.id), isNull(reviewSessions.revokedAt)));

  await tx
    .update(projectEnvironments)
    .set({ isEnabled: false, updatedAt: now })
    .where(eq(projectEnvironments.workspaceId, workspace.id));

  await tx
    .update(webhookEndpoints)
    .set({ isEnabled: false, updatedAt: now })
    .where(eq(webhookEndpoints.workspaceId, workspace.id));
  await tx
    .update(webhookDeliveries)
    .set({ status: "cancelled" })
    .where(
      and(
        eq(webhookDeliveries.workspaceId, workspace.id),
        inArray(webhookDeliveries.status, ["pending", "processing"]),
      ),
    );

  const videos = await tx
    .select({
      id: videoAssets.id,
      workspaceId: videoAssets.workspaceId,
      evidenceId: videoAssets.evidenceId,
      providerAssetId: videoAssets.providerAssetId,
      providerUploadId: videoAssets.providerUploadId,
    })
    .from(videoAssets)
    .where(
      and(
        eq(videoAssets.workspaceId, workspace.id),
        inArray(videoAssets.lifecycle, ["current", "replacement"]),
      ),
    );
  const retired: RemovableVideoRow[] = [];
  for (const video of videos) {
    if (await retireVideoRow(tx, video, { lifecycle: "removed", reason: "project_deleted", now })) {
      retired.push(video);
    }
  }

  await recordWorkspaceActivity(tx, {
    workspaceId: workspace.id,
    actorUserId: input.actorUserId,
    type: WORKSPACE_ACTIVITY_TYPES.DELETED,
    data: {
      workspaceName: workspace.name,
      purgeAfter: purgeAfter.toISOString(),
      memberCount: memberRows.length,
    },
  });

  return {
    alreadyDeleted: false,
    purgeAfter,
    tail: {
      ...emptyTail,
      videos: retired,
      emails: memberRows
        .filter((row) => row.userId !== input.actorUserId)
        .map((row) => row.email),
    },
  };
}

/** Work that must not hold a transaction open: provider deletion and courtesy emails. */
export async function finishWorkspaceClosure(tail: DeletedWorkspaceTail): Promise<void> {
  for (const video of tail.videos) {
    // The cleanup job keeps trying until the provider confirms.
    await deleteProviderCopyNow(video.id).catch(() => undefined);
  }
  for (const email of tail.emails) {
    await sendEmail({
      to: email,
      subject: `${tail.workspaceName} was deleted on Passoff`,
      text: [
        `${tail.actorName} deleted the ${tail.workspaceName} workspace on Passoff.`,
        "",
        "You can no longer open it. If this was a surprise, contact the person who deleted it.",
      ].join("\n"),
    }).catch(() => undefined);
  }
}

/**
 * Deletes the workspace the owner is looking at. The owner has to type its name, and the
 * form has to be for this same workspace, so a stale or replayed request can never delete
 * a different one. Repeating the request after it worked is not an error.
 */
export async function deleteWorkspace(
  context: WorkspaceContext,
  input: { workspaceId: string; confirmName: string },
  now: Date = new Date(),
): Promise<DeleteWorkspaceResult> {
  if (!can(context, "workspace.delete")) {
    return { ok: false, error: "forbidden", message: WORKSPACE_DELETE_MESSAGES.forbidden };
  }
  if (input.workspaceId !== context.workspaceId) {
    return { ok: false, error: "stale", message: WORKSPACE_DELETE_MESSAGES.stale };
  }
  if (input.confirmName.trim() !== context.workspaceName) {
    return {
      ok: false,
      error: "confirm_mismatch",
      message: WORKSPACE_DELETE_MESSAGES.confirmMismatch,
    };
  }

  try {
    const outcome = await db.transaction(async (tx) => {
      const callerRole = await loadCallerRole(tx, context);
      if (!can({ role: callerRole }, "workspace.delete")) return "forbidden" as const;
      return closeWorkspaceInTx(tx, {
        workspaceId: context.workspaceId,
        actorUserId: context.userId,
        now,
      });
    });

    if (outcome === "forbidden") {
      return { ok: false, error: "forbidden", message: WORKSPACE_DELETE_MESSAGES.forbidden };
    }
    if (!outcome) {
      return { ok: false, error: "stale", message: WORKSPACE_DELETE_MESSAGES.stale };
    }

    await finishWorkspaceClosure(outcome.tail).catch(() => undefined);
    return {
      ok: true,
      alreadyDeleted: outcome.alreadyDeleted,
      workspaceName: context.workspaceName,
      purgeAfter: outcome.purgeAfter,
    };
  } catch {
    return { ok: false, error: "unavailable", message: WORKSPACE_DELETE_MESSAGES.unavailable };
  }
}

export type PurgeSummary = {
  due: number;
  purged: number;
  waitingOnStorage: number;
  failed: number;
};

/**
 * Cleanup job: permanently removes workspaces whose waiting period is over. A workspace
 * is skipped, and tried again next run, while any stored video is still waiting to be
 * deleted at the provider.
 */
export async function purgeDeletedWorkspaces(
  options: { now?: Date; limit?: number } = {},
): Promise<PurgeSummary> {
  const now = options.now ?? new Date();
  const due = await db
    .select({ id: workspaces.id })
    .from(workspaces)
    .where(
      and(
        isNotNull(workspaces.deletedAt),
        isNotNull(workspaces.purgeAfter),
        lte(workspaces.purgeAfter, now),
      ),
    )
    .limit(options.limit ?? 10);

  const summary: PurgeSummary = { due: due.length, purged: 0, waitingOnStorage: 0, failed: 0 };
  for (const { id } of due) {
    try {
      const [pending] = await db
        .select({ id: videoAssets.id })
        .from(videoAssets)
        .where(
          and(
            eq(videoAssets.workspaceId, id),
            isNull(videoAssets.providerDeletedAt),
            isNotNull(videoAssets.providerDeleteRequestedAt),
          ),
        )
        .limit(1);
      if (pending) {
        summary.waitingOnStorage += 1;
        continue;
      }

      const [stillLive] = await db
        .select({ id: videoAssets.id })
        .from(videoAssets)
        .where(
          and(
            eq(videoAssets.workspaceId, id),
            isNull(videoAssets.providerDeletedAt),
            inArray(videoAssets.lifecycle, ["current", "replacement"]),
          ),
        )
        .limit(1);
      if (stillLive) {
        summary.waitingOnStorage += 1;
        continue;
      }

      const removed = await db
        .delete(workspaces)
        .where(and(eq(workspaces.id, id), isNotNull(workspaces.deletedAt)))
        .returning({ id: workspaces.id });
      if (removed.length > 0) summary.purged += 1;
    } catch {
      summary.failed += 1;
    }
  }
  return summary;
}
