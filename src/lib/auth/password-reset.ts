import "server-only";

import { and, eq, gt, isNull, sql } from "drizzle-orm";

import { db } from "@/db";
import { passwordResetTokens, sessions, users } from "@/db/schema";
import { normalizeEmail } from "@/lib/auth/email";
import { hashPassword } from "@/lib/auth/password";
import {
  createPasswordResetToken,
  hashToken,
} from "@/lib/auth/tokens";
import { sendPasswordResetEmail } from "@/lib/email";
import { absoluteUrl } from "@/lib/site";

export type ResetTokenStatus =
  | { status: "valid"; userId: string }
  | { status: "invalid" }
  | { status: "expired" }
  | { status: "used" };

export async function requestPasswordReset(email: string): Promise<void> {
  const normalized = normalizeEmail(email);
  const [user] = await db
    .select({
      id: users.id,
      email: users.email,
      passwordHash: users.passwordHash,
      deletedAt: users.deletedAt,
    })
    .from(users)
    .where(and(sql`lower(${users.email}) = ${normalized}`, isNull(users.deletedAt)))
    .limit(1);

  // Eligible users: active, non-deleted, and already have a password.
  // OAuth-only accounts do not receive a reset token (no account enumeration).
  if (!user?.passwordHash) {
    return;
  }

  const { rawToken, tokenHash, expiresAt } = createPasswordResetToken();
  const now = new Date();

  await db.transaction(async (tx) => {
    await tx
      .update(passwordResetTokens)
      .set({ consumedAt: now })
      .where(
        and(
          eq(passwordResetTokens.userId, user.id),
          isNull(passwordResetTokens.consumedAt),
        ),
      );

    await tx.insert(passwordResetTokens).values({
      userId: user.id,
      tokenHash,
      expiresAt,
    });
  });

  await sendPasswordResetEmail({
    to: user.email,
    resetUrl: absoluteUrl(`/reset-password?token=${rawToken}`),
  });
}

export async function inspectResetToken(rawToken: string): Promise<ResetTokenStatus> {
  if (!rawToken) {
    return { status: "invalid" };
  }

  const tokenHash = hashToken(rawToken);
  const [row] = await db
    .select({
      userId: passwordResetTokens.userId,
      expiresAt: passwordResetTokens.expiresAt,
      consumedAt: passwordResetTokens.consumedAt,
      deletedAt: users.deletedAt,
      passwordHash: users.passwordHash,
    })
    .from(passwordResetTokens)
    .innerJoin(users, eq(users.id, passwordResetTokens.userId))
    .where(eq(passwordResetTokens.tokenHash, tokenHash))
    .limit(1);

  if (!row || row.deletedAt || !row.passwordHash) {
    return { status: "invalid" };
  }

  if (row.consumedAt) {
    return { status: "used" };
  }

  if (row.expiresAt.getTime() <= Date.now()) {
    return { status: "expired" };
  }

  return { status: "valid", userId: row.userId };
}

export async function resetPasswordWithToken(options: {
  rawToken: string;
  password: string;
}): Promise<"success" | "invalid" | "expired" | "used" | "unavailable"> {
  const tokenHash = hashToken(options.rawToken);
  const passwordHash = await hashPassword(options.password);
  const now = new Date();

  try {
    const result = await db.transaction(async (tx) => {
      const [row] = await tx
        .select({
          id: passwordResetTokens.id,
          userId: passwordResetTokens.userId,
          expiresAt: passwordResetTokens.expiresAt,
          consumedAt: passwordResetTokens.consumedAt,
          deletedAt: users.deletedAt,
        })
        .from(passwordResetTokens)
        .innerJoin(users, eq(users.id, passwordResetTokens.userId))
        .where(eq(passwordResetTokens.tokenHash, tokenHash))
        .limit(1)
        .for("update");

      if (!row || row.deletedAt) {
        return "invalid" as const;
      }

      if (row.consumedAt) {
        return "used" as const;
      }

      if (row.expiresAt.getTime() <= Date.now()) {
        return "expired" as const;
      }

      // Claim the token first so concurrent attempts cannot both succeed.
      const claimed = await tx
        .update(passwordResetTokens)
        .set({ consumedAt: now })
        .where(
          and(
            eq(passwordResetTokens.id, row.id),
            isNull(passwordResetTokens.consumedAt),
            gt(passwordResetTokens.expiresAt, now),
          ),
        )
        .returning({ id: passwordResetTokens.id });

      if (claimed.length === 0) {
        return "used" as const;
      }

      await tx
        .update(passwordResetTokens)
        .set({ consumedAt: now })
        .where(
          and(
            eq(passwordResetTokens.userId, row.userId),
            isNull(passwordResetTokens.consumedAt),
          ),
        );

      await tx
        .update(users)
        .set({
          passwordHash,
          sessionVersion: sql`${users.sessionVersion} + 1`,
          updatedAt: now,
        })
        .where(eq(users.id, row.userId));

      // Clear any leftover Auth.js database sessions if present.
      await tx.delete(sessions).where(eq(sessions.userId, row.userId));

      return "success" as const;
    });

    return result;
  } catch {
    return "unavailable";
  }
}
