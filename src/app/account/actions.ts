"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/db";
import { users, workspaces } from "@/db/schema";
import { normalizeEmail } from "@/lib/auth/password";
import { requireActiveWorkspaceMembership } from "@/lib/auth/authorization";

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
    return { success: "Profile updated." };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Unable to update profile.",
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
