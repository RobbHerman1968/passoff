"use server";

import { createHash, randomBytes } from "node:crypto";

import { and, eq, gt, isNull } from "drizzle-orm";

import { db } from "@/db";
import { passwordResetTokens, users } from "@/db/schema";
import { findUserByEmail, hashPassword, normalizeEmail, validatePassword } from "@/lib/auth/password";
import { enqueueOutbox, processOutboxBatch } from "@/lib/rooms/outbox";
import { getSiteUrl } from "@/lib/site";

export type PasswordFormState = {
  error?: string;
  success?: string;
};

function hashResetToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function requestPasswordReset(
  _prev: PasswordFormState,
  formData: FormData,
): Promise<PasswordFormState> {
  const email = normalizeEmail(String(formData.get("email") || ""));
  if (!email || !email.includes("@")) {
    return { error: "Enter a valid email address." };
  }

  const genericSuccess =
    "If an account exists for that email, we sent a reset link. Check your inbox.";

  try {
    const user = await findUserByEmail(email);
    if (!user?.passwordHash) {
      return { success: genericSuccess };
    }

    const rawToken = randomBytes(32).toString("base64url");
    const tokenHash = hashResetToken(rawToken);
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

    await db.insert(passwordResetTokens).values({
      userId: user.id,
      tokenHash,
      expiresAt,
    });

    const resetUrl = `${getSiteUrl()}/reset-password?token=${encodeURIComponent(rawToken)}`;
    await enqueueOutbox({
      type: "email.password_reset",
      payload: {
        to: user.email,
        resetUrl,
      },
      idempotencyKey: `email.password_reset:${user.id}:${tokenHash}`,
    });

    // Best-effort flush so reset mail does not wait solely on the cron worker.
    void processOutboxBatch(10).catch(() => undefined);

    return { success: genericSuccess };
  } catch {
    return { error: "Unable to start a password reset. Try again." };
  }
}

export async function resetPasswordWithToken(
  _prev: PasswordFormState,
  formData: FormData,
): Promise<PasswordFormState> {
  const token = String(formData.get("token") || "").trim();
  const password = String(formData.get("password") || "");
  const confirm = String(formData.get("confirm") || "");

  if (!token) {
    return { error: "This reset link is missing or invalid." };
  }

  const passwordError = validatePassword(password);
  if (passwordError) return { error: passwordError };
  if (password !== confirm) {
    return { error: "Passwords do not match." };
  }

  const tokenHash = hashResetToken(token);
  const now = new Date();

  const row = (
    await db
      .select({
        id: passwordResetTokens.id,
        userId: passwordResetTokens.userId,
      })
      .from(passwordResetTokens)
      .where(
        and(
          eq(passwordResetTokens.tokenHash, tokenHash),
          isNull(passwordResetTokens.usedAt),
          gt(passwordResetTokens.expiresAt, now),
        ),
      )
      .limit(1)
  )[0];

  if (!row) {
    return { error: "This reset link is invalid or has expired." };
  }

  const passwordHash = await hashPassword(password);
  await db.transaction(async (tx) => {
    await tx
      .update(users)
      .set({ passwordHash, updatedAt: new Date() })
      .where(eq(users.id, row.userId));
    await tx
      .update(passwordResetTokens)
      .set({ usedAt: now })
      .where(eq(passwordResetTokens.id, row.id));
  });

  return { success: "Password updated. You can sign in with your new password." };
}
