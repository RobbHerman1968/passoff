import "server-only";

import { randomUUID } from "node:crypto";

import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import { workspaceMemberships } from "@/db/schema";
import {
  actorLabel,
  dispatchNotifications,
  type CreateNotificationInput,
} from "@/lib/notifications/service";
import type { WorkspaceContext } from "@/lib/workspaces/context";

/**
 * In-app notices about people joining, leaving, or taking over a workspace.
 * They carry names and a path to the members page, never invitation links or tokens.
 */
const MEMBERS_PATH = "/settings/members";

type Basics = { workspaceId: string; workspaceName: string };

function base(
  basics: Basics,
  actorName: string,
): CreateNotificationInput["data"] {
  return {
    workspaceName: basics.workspaceName,
    projectName: "",
    reviewName: "",
    actorName,
  };
}

async function listOwnerIds(workspaceId: string): Promise<string[]> {
  const rows = await db
    .select({ userId: workspaceMemberships.userId })
    .from(workspaceMemberships)
    .where(
      and(
        eq(workspaceMemberships.workspaceId, workspaceId),
        eq(workspaceMemberships.status, "active"),
        eq(workspaceMemberships.role, "owner"),
      ),
    );
  return rows.map((row) => row.userId);
}

export async function notifyMemberJoined(input: {
  workspaceId: string;
  workspaceName: string;
  memberUserId: string;
  memberName: string;
}): Promise<void> {
  const owners = await listOwnerIds(input.workspaceId);
  await dispatchNotifications(
    owners.map((recipientUserId) => ({
      recipientUserId,
      actorUserId: input.memberUserId,
      workspaceId: input.workspaceId,
      projectId: null,
      reviewId: null,
      issueId: null,
      type: "workspace.member_joined" as const,
      dedupeKey: `workspace.member_joined:${input.workspaceId}:${input.memberUserId}:${randomUUID()}`,
      hrefPath: MEMBERS_PATH,
      data: base(input, input.memberName),
    })),
  );
}

export async function notifyMemberLeft(context: WorkspaceContext): Promise<void> {
  const owners = await listOwnerIds(context.workspaceId);
  await dispatchNotifications(
    owners.map((recipientUserId) => ({
      recipientUserId,
      actorUserId: context.userId,
      workspaceId: context.workspaceId,
      projectId: null,
      reviewId: null,
      issueId: null,
      type: "workspace.member_left" as const,
      dedupeKey: `workspace.member_left:${context.workspaceId}:${context.userId}:${randomUUID()}`,
      hrefPath: MEMBERS_PATH,
      data: base(context, actorLabel(context)),
    })),
  );
}

export async function notifyOwnershipTransferred(
  context: WorkspaceContext,
  newOwnerUserId: string,
): Promise<void> {
  await dispatchNotifications([
    {
      recipientUserId: newOwnerUserId,
      actorUserId: context.userId,
      workspaceId: context.workspaceId,
      projectId: null,
      reviewId: null,
      issueId: null,
      type: "workspace.ownership_transferred",
      dedupeKey: `workspace.ownership_transferred:${context.workspaceId}:${newOwnerUserId}:${randomUUID()}`,
      hrefPath: MEMBERS_PATH,
      data: base(context, actorLabel(context)),
    },
  ]);
}
