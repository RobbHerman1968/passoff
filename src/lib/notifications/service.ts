import "server-only";

import { and, count, desc, eq, isNull, sql } from "drizzle-orm";

import { db } from "@/db";
import {
  issues,
  notifications,
  projects,
  reviews,
  deployments,
  userNotificationSettings,
  users,
  workspaceMemberships,
  workspaces,
} from "@/db/schema";
import { sendNotificationEmail } from "@/lib/notifications/email";
import {
  DEFAULT_NOTIFICATION_SETTINGS,
  emailCategoryForType,
  emailEnabledForCategory,
  isEssentialEmailType,
  shouldEmailNotification,
  type NotificationListItem,
  type NotificationPayload,
  type NotificationType,
  type UserNotificationSettings,
} from "@/lib/notifications/types";
import { issueDetailPath, reviewIssuesPath } from "@/lib/issues/url";
import { personDisplayName } from "@/lib/users/display-name";
import type { WorkspaceContext } from "@/lib/workspaces/context";

export const NOTIFICATION_PAGE_SIZE = 30;

export type { NotificationListItem };

export type CreateNotificationInput = {
  recipientUserId: string;
  actorUserId: string | null;
  workspaceId: string;
  projectId: string | null;
  reviewId: string | null;
  issueId: string | null;
  type: NotificationType;
  dedupeKey: string;
  hrefPath: string;
  data: NotificationPayload;
};

export async function getUserNotificationSettings(
  userId: string,
): Promise<UserNotificationSettings> {
  const [row] = await db
    .select({
      emailAssignments: userNotificationSettings.emailAssignments,
      emailReplies: userNotificationSettings.emailReplies,
      emailVerification: userNotificationSettings.emailVerification,
      emailApproval: userNotificationSettings.emailApproval,
    })
    .from(userNotificationSettings)
    .where(eq(userNotificationSettings.userId, userId))
    .limit(1);

  return row ?? DEFAULT_NOTIFICATION_SETTINGS;
}

export async function updateUserNotificationSettings(
  userId: string,
  patch: Partial<UserNotificationSettings>,
): Promise<UserNotificationSettings> {
  const current = await getUserNotificationSettings(userId);
  const next = { ...current, ...patch };
  const now = new Date();
  await db
    .insert(userNotificationSettings)
    .values({
      userId,
      ...next,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: userNotificationSettings.userId,
      set: {
        ...next,
        updatedAt: now,
      },
    });
  return next;
}

export async function listActiveWorkspaceMemberIds(
  workspaceId: string,
  exceptUserId?: string,
): Promise<string[]> {
  const rows = await db
    .select({ userId: workspaceMemberships.userId })
    .from(workspaceMemberships)
    .innerJoin(users, eq(users.id, workspaceMemberships.userId))
    .where(
      and(
        eq(workspaceMemberships.workspaceId, workspaceId),
        eq(workspaceMemberships.status, "active"),
        isNull(users.deletedAt),
      ),
    );

  return rows
    .map((row) => row.userId)
    .filter((userId) => userId !== exceptUserId);
}

export async function dispatchNotifications(
  inputs: CreateNotificationInput[],
): Promise<{ created: number }> {
  const unique = new Map<string, CreateNotificationInput>();
  for (const input of inputs) {
    if (input.recipientUserId === input.actorUserId) continue;
    unique.set(input.dedupeKey, input);
  }
  if (unique.size === 0) return { created: 0 };

  const values = [...unique.values()];
  const inserted = await db
    .insert(notifications)
    .values(
      values.map((input) => ({
        recipientUserId: input.recipientUserId,
        actorUserId: input.actorUserId,
        workspaceId: input.workspaceId,
        projectId: input.projectId,
        reviewId: input.reviewId,
        issueId: input.issueId,
        type: input.type,
        dedupeKey: input.dedupeKey,
        hrefPath: input.hrefPath,
        data: input.data,
        emailStatus: "pending" as const,
      })),
    )
    .onConflictDoNothing({ target: notifications.dedupeKey })
    .returning({
      id: notifications.id,
      recipientUserId: notifications.recipientUserId,
      type: notifications.type,
      hrefPath: notifications.hrefPath,
      data: notifications.data,
    });

  for (const row of inserted) {
    await deliverNotificationEmail({
      id: row.id,
      recipientUserId: row.recipientUserId,
      type: row.type as NotificationType,
      hrefPath: row.hrefPath,
      data: (row.data ?? {}) as NotificationPayload,
    });
  }

  return { created: inserted.length };
}

async function deliverNotificationEmail(row: {
  id: string;
  recipientUserId: string;
  type: NotificationType;
  hrefPath: string;
  data: NotificationPayload;
}) {
  const category = emailCategoryForType(row.type);
  const essential = isEssentialEmailType(row.type);
  if (!shouldEmailNotification(row.type)) {
    await db
      .update(notifications)
      .set({ emailStatus: "skipped", emailedAt: new Date() })
      .where(eq(notifications.id, row.id));
    return;
  }

  const settings = essential ? null : await getUserNotificationSettings(row.recipientUserId);
  if (!essential && category && settings && !emailEnabledForCategory(settings, category)) {
    await db
      .update(notifications)
      .set({ emailStatus: "skipped", emailedAt: new Date() })
      .where(eq(notifications.id, row.id));
    return;
  }

  const [recipient] = await db
    .select({ email: users.email, deletedAt: users.deletedAt })
    .from(users)
    .where(eq(users.id, row.recipientUserId))
    .limit(1);

  if (!recipient?.email || recipient.deletedAt) {
    await db
      .update(notifications)
      .set({ emailStatus: "skipped", emailedAt: new Date() })
      .where(eq(notifications.id, row.id));
    return;
  }

  try {
    await sendNotificationEmail({
      to: recipient.email,
      type: row.type,
      data: row.data,
      hrefPath: `/notifications/${row.id}`,
    });
    await db
      .update(notifications)
      .set({
        emailStatus: "sent",
        emailedAt: new Date(),
        emailError: null,
      })
      .where(eq(notifications.id, row.id));
  } catch {
    await db
      .update(notifications)
      .set({
        emailStatus: "failed",
        emailError: "We couldn’t send this email.",
      })
      .where(eq(notifications.id, row.id));
  }
}

export async function retryFailedNotificationEmail(
  notificationId: string,
): Promise<boolean> {
  const [row] = await db
    .select()
    .from(notifications)
    .where(eq(notifications.id, notificationId))
    .limit(1);
  if (!row || row.emailStatus !== "failed") return false;
  await deliverNotificationEmail({
    id: row.id,
    recipientUserId: row.recipientUserId,
    type: row.type as NotificationType,
    hrefPath: row.hrefPath,
    data: (row.data ?? {}) as NotificationPayload,
  });
  return true;
}

export async function countUnreadNotifications(userId: string): Promise<number> {
  const [row] = await db
    .select({ total: count() })
    .from(notifications)
    .where(
      and(eq(notifications.recipientUserId, userId), isNull(notifications.readAt)),
    );
  return Number(row?.total ?? 0);
}

export async function listNotificationsForUser(
  userId: string,
  options: { unreadOnly?: boolean; page?: number } = {},
): Promise<{ items: NotificationListItem[]; total: number; page: number; pageCount: number }> {
  const pageSize = NOTIFICATION_PAGE_SIZE;
  const conditions = [eq(notifications.recipientUserId, userId)];
  if (options.unreadOnly) {
    conditions.push(isNull(notifications.readAt));
  }
  const where = and(...conditions);

  const [countRow] = await db
    .select({ total: count() })
    .from(notifications)
    .where(where);
  const total = Number(countRow?.total ?? 0);
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(Math.max(options.page ?? 1, 1), pageCount);

  const rows = await db
    .select({
      id: notifications.id,
      type: notifications.type,
      hrefPath: notifications.hrefPath,
      createdAt: notifications.createdAt,
      readAt: notifications.readAt,
      data: notifications.data,
    })
    .from(notifications)
    .where(where)
    .orderBy(desc(notifications.createdAt))
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  return {
    items: rows.map((row) => ({
      id: row.id,
      type: row.type as NotificationType,
      hrefPath: row.hrefPath,
      createdAt: row.createdAt,
      readAt: row.readAt,
      data: (row.data ?? {}) as NotificationPayload,
    })),
    total,
    page,
    pageCount,
  };
}

export async function markNotificationRead(
  userId: string,
  notificationId: string,
): Promise<boolean> {
  const [updated] = await db
    .update(notifications)
    .set({ readAt: sql`coalesce(${notifications.readAt}, now())` })
    .where(
      and(
        eq(notifications.id, notificationId),
        eq(notifications.recipientUserId, userId),
      ),
    )
    .returning({ id: notifications.id });
  return Boolean(updated);
}

export async function markNotificationUnread(
  userId: string,
  notificationId: string,
): Promise<boolean> {
  const [updated] = await db
    .update(notifications)
    .set({ readAt: null })
    .where(
      and(
        eq(notifications.id, notificationId),
        eq(notifications.recipientUserId, userId),
      ),
    )
    .returning({ id: notifications.id });
  return Boolean(updated);
}

export async function markAllNotificationsRead(userId: string): Promise<number> {
  const updated = await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(
      and(eq(notifications.recipientUserId, userId), isNull(notifications.readAt)),
    )
    .returning({ id: notifications.id });
  return updated.length;
}

export async function getNotificationForUser(
  userId: string,
  notificationId: string,
): Promise<NotificationListItem | null> {
  const [row] = await db
    .select({
      id: notifications.id,
      type: notifications.type,
      hrefPath: notifications.hrefPath,
      createdAt: notifications.createdAt,
      readAt: notifications.readAt,
      data: notifications.data,
      workspaceId: notifications.workspaceId,
      projectId: notifications.projectId,
      reviewId: notifications.reviewId,
      issueId: notifications.issueId,
    })
    .from(notifications)
    .where(
      and(
        eq(notifications.id, notificationId),
        eq(notifications.recipientUserId, userId),
      ),
    )
    .limit(1);
  if (!row) return null;
  return {
    id: row.id,
    type: row.type as NotificationType,
    hrefPath: row.hrefPath,
    createdAt: row.createdAt,
    readAt: row.readAt,
    data: (row.data ?? {}) as NotificationPayload,
  };
}

export async function notificationTargetAccessible(
  context: WorkspaceContext,
  notification: NotificationListItem & {
    workspaceId?: string;
    projectId?: string | null;
    reviewId?: string | null;
    issueId?: string | null;
  },
): Promise<boolean> {
  const [row] = await db
    .select({
      workspaceId: notifications.workspaceId,
      projectId: notifications.projectId,
      reviewId: notifications.reviewId,
      issueId: notifications.issueId,
    })
    .from(notifications)
    .where(
      and(
        eq(notifications.id, notification.id),
        eq(notifications.recipientUserId, context.userId),
      ),
    )
    .limit(1);
  if (!row || row.workspaceId !== context.workspaceId) return false;

  if (row.projectId) {
    const [project] = await db
      .select({ id: projects.id })
      .from(projects)
      .where(
        and(
          eq(projects.id, row.projectId),
          eq(projects.workspaceId, context.workspaceId),
          isNull(projects.deletedAt),
        ),
      )
      .limit(1);
    if (!project) return false;
  }

  if (row.reviewId) {
    const [review] = await db
      .select({ id: reviews.id })
      .from(reviews)
      .where(
        and(
          eq(reviews.id, row.reviewId),
          eq(reviews.workspaceId, context.workspaceId),
        ),
      )
      .limit(1);
    if (!review) return false;
  }

  if (row.issueId) {
    const [issue] = await db
      .select({ id: issues.id })
      .from(issues)
      .where(
        and(
          eq(issues.id, row.issueId),
          eq(issues.workspaceId, context.workspaceId),
          isNull(issues.deletedAt),
        ),
      )
      .limit(1);
    if (!issue) return false;
  }

  return true;
}

export async function loadNotificationContext(workspaceId: string, projectId: string, reviewId: string) {
  const [row] = await db
    .select({
      workspaceName: workspaces.name,
      projectName: projects.name,
      reviewName: reviews.name,
      versionLabel: deployments.identifier,
    })
    .from(reviews)
    .innerJoin(projects, eq(projects.id, reviews.projectId))
    .innerJoin(workspaces, eq(workspaces.id, reviews.workspaceId))
    .innerJoin(deployments, eq(deployments.id, reviews.deploymentId))
    .where(
      and(
        eq(reviews.id, reviewId),
        eq(reviews.projectId, projectId),
        eq(reviews.workspaceId, workspaceId),
      ),
    )
    .limit(1);
  return row ?? null;
}

export function actorLabel(context: { userName: string | null; userEmail: string | null }) {
  return personDisplayName(context.userName, context.userEmail);
}

export function issueHref(projectId: string, reviewId: string, issueNumber: number) {
  return issueDetailPath(projectId, reviewId, issueNumber);
}

export function reviewHref(projectId: string, reviewId: string) {
  return reviewIssuesPath(projectId, reviewId);
}
