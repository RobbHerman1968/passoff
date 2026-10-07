import "server-only";

import { and, eq, isNull } from "drizzle-orm";

import { db } from "@/db";
import { users, workspaceMemberships, workspaces } from "@/db/schema";
import { dispatchNotifications } from "@/lib/notifications/service";
import type { NotificationPayload, NotificationType } from "@/lib/notifications/types";

export type BillingNotificationType = Extract<NotificationType, `billing.${string}`>;

export const BILLING_PATH = "/settings/billing";

/**
 * Tells the workspace owner about something in billing. Billing is owner-only, so members
 * are never notified, and nothing here carries card details, invoice links, or provider ids.
 *
 * `dedupeKey` must describe the event, not the moment: sending the same event twice
 * (a repeated webhook, a second run of a scheduled job) creates one notice.
 */
export async function notifyWorkspaceOwners(input: {
  workspaceId: string;
  type: BillingNotificationType;
  dedupeKey: string;
  data?: Partial<NotificationPayload>;
}): Promise<{ created: number }> {
  const [workspace] = await db
    .select({ name: workspaces.name, deletedAt: workspaces.deletedAt })
    .from(workspaces)
    .where(eq(workspaces.id, input.workspaceId))
    .limit(1);
  if (!workspace || workspace.deletedAt) return { created: 0 };

  const owners = await db
    .select({ userId: workspaceMemberships.userId })
    .from(workspaceMemberships)
    .innerJoin(users, eq(users.id, workspaceMemberships.userId))
    .where(
      and(
        eq(workspaceMemberships.workspaceId, input.workspaceId),
        eq(workspaceMemberships.status, "active"),
        eq(workspaceMemberships.role, "owner"),
        isNull(users.deletedAt),
      ),
    );

  return dispatchNotifications(
    owners.map((owner) => ({
      recipientUserId: owner.userId,
      actorUserId: null,
      workspaceId: input.workspaceId,
      projectId: null,
      reviewId: null,
      issueId: null,
      type: input.type,
      dedupeKey: `${input.dedupeKey}:${owner.userId}`,
      hrefPath: BILLING_PATH,
      data: {
        workspaceName: workspace.name,
        projectName: "",
        reviewName: "",
        actorName: "Passoff",
        ...input.data,
      },
    })),
  );
}
