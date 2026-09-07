"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/db";
import { users, workspaces } from "@/db/schema";
import {
  hashPassword,
  normalizeEmail,
  validatePassword,
  verifyPassword,
} from "@/lib/auth/password";
import { requireActiveWorkspaceMembership } from "@/lib/auth/authorization";
import { signOut } from "@/auth";

export type AccountFormState = {
  error?: string;
  success?: string;
};

export async function updateAccountProfile(
  _prev: AccountFormState,
  formData: FormData,
): Promise<AccountFormState> {
  try {
    const scope = await requireActiveWorkspaceMembership();
    const name = String(formData.get("name") || "").trim().slice(0, 120);
    if (!name) {
      return { error: "Name is required." };
    }

    await db
      .update(users)
      .set({ name, updatedAt: new Date() })
      .where(eq(users.id, scope.userId));

    revalidatePath("/account");
    revalidatePath("/dashboard");
    return { success: "Profile updated." };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Unable to update profile.",
    };
  }
}

export async function updateAccountPassword(
  _prev: AccountFormState,
  formData: FormData,
): Promise<AccountFormState> {
  try {
    const scope = await requireActiveWorkspaceMembership();
    const currentPassword = String(formData.get("currentPassword") || "");
    const password = String(formData.get("password") || "");
    const confirm = String(formData.get("confirm") || "");

    if (!currentPassword || !password || !confirm) {
      return { error: "Fill in all password fields." };
    }

    const passwordError = validatePassword(password);
    if (passwordError) return { error: passwordError };
    if (password !== confirm) {
      return { error: "New passwords do not match." };
    }

    const user = (
      await db.select().from(users).where(eq(users.id, scope.userId)).limit(1)
    )[0];
    if (!user?.passwordHash) {
      return { error: "Password sign-in is not enabled for this account." };
    }

    const valid = await verifyPassword(currentPassword, user.passwordHash);
    if (!valid) {
      return { error: "Current password is incorrect." };
    }

    const passwordHash = await hashPassword(password);
    await db
      .update(users)
      .set({ passwordHash, updatedAt: new Date() })
      .where(eq(users.id, scope.userId));

    revalidatePath("/account");
    return { success: "Password updated." };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Unable to update password.",
    };
  }
}

export async function updateNotificationEmail(
  _prev: AccountFormState,
  formData: FormData,
): Promise<AccountFormState> {
  try {
    const scope = await requireActiveWorkspaceMembership();
    const email = normalizeEmail(String(formData.get("notificationEmail") || ""));
    if (!email || !email.includes("@")) {
      return { error: "Enter a valid notification email." };
    }

    await db
      .update(workspaces)
      .set({
        notificationEmail: email,
        replyToEmail: email,
        updatedAt: new Date(),
      })
      .where(eq(workspaces.id, scope.workspaceId));

    revalidatePath("/account");
    return { success: "Notification email updated." };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Unable to update notification email.",
    };
  }
}

export async function signOutAction() {
  await signOut({ redirectTo: "/" });
}
