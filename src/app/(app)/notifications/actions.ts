"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import {
  getNotificationForUser,
  listNotificationsForUser,
  markAllNotificationsRead,
  markNotificationRead,
  markNotificationUnread,
  notificationTargetAccessible,
  updateUserNotificationSettings,
} from "@/lib/notifications/service";
import { requireWorkspaceContext } from "@/lib/workspaces/context";

const idSchema = z.string().uuid();

export async function listRecentNotificationsAction() {
  const auth = await requireWorkspaceContext();
  if (!auth.ok) {
    return { ok: false as const, message: "Sign in to continue." };
  }
  const result = await listNotificationsForUser(auth.context.userId, { page: 1 });
  return { ok: true as const, ...result };
}

export async function markNotificationReadAction(notificationId: string) {
  const auth = await requireWorkspaceContext();
  if (!auth.ok) return { ok: false as const };
  const parsed = idSchema.safeParse(notificationId);
  if (!parsed.success) return { ok: false as const };
  await markNotificationRead(auth.context.userId, parsed.data);
  revalidatePath("/notifications");
  return { ok: true as const };
}

export async function markNotificationUnreadAction(notificationId: string) {
  const auth = await requireWorkspaceContext();
  if (!auth.ok) return { ok: false as const };
  const parsed = idSchema.safeParse(notificationId);
  if (!parsed.success) return { ok: false as const };
  await markNotificationUnread(auth.context.userId, parsed.data);
  revalidatePath("/notifications");
  return { ok: true as const };
}

export async function markAllNotificationsReadAction() {
  const auth = await requireWorkspaceContext();
  if (!auth.ok) return { ok: false as const };
  await markAllNotificationsRead(auth.context.userId);
  revalidatePath("/notifications");
  return { ok: true as const };
}

export async function openNotificationAction(notificationId: string): Promise<{
  ok: true;
  href: string;
} | { ok: false; unavailable: true }> {
  const auth = await requireWorkspaceContext();
  if (!auth.ok) return { ok: false, unavailable: true };
  const parsed = idSchema.safeParse(notificationId);
  if (!parsed.success) return { ok: false, unavailable: true };

  const notification = await getNotificationForUser(
    auth.context.userId,
    parsed.data,
  );
  if (!notification) return { ok: false, unavailable: true };

  const accessible = await notificationTargetAccessible(auth.context, notification);
  if (!accessible) return { ok: false, unavailable: true };

  await markNotificationRead(auth.context.userId, parsed.data);
  revalidatePath("/notifications");
  return { ok: true, href: notification.hrefPath };
}

export async function updateNotificationSettingsAction(input: {
  emailAssignments?: boolean;
  emailReplies?: boolean;
  emailVerification?: boolean;
  emailApproval?: boolean;
}) {
  const auth = await requireWorkspaceContext();
  if (!auth.ok) {
    return { ok: false as const, message: "Sign in to continue." };
  }
  const settings = await updateUserNotificationSettings(auth.context.userId, input);
  revalidatePath("/settings/notifications");
  return { ok: true as const, settings };
}
