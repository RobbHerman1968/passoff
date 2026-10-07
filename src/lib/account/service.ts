import "server-only";

import { and, count, eq, isNull, ne, sql } from "drizzle-orm";

import { db } from "@/db";
import {
  accounts,
  authenticators,
  notifications,
  passwordResetTokens,
  sessions,
  userNotificationSettings,
  users,
  workspaceMemberships,
  workspaces,
} from "@/db/schema";
import { normalizeEmail } from "@/lib/auth/email";
import { verifyPassword } from "@/lib/auth/password";
import { formatPersonName } from "@/lib/auth/person-name";
import { enforceAuthRateLimit, formatRetryGuidance } from "@/lib/auth/rate-limit";
import {
  closeWorkspaceInTx,
  finishWorkspaceClosure,
  type DeletedWorkspaceTail,
} from "@/lib/workspaces/deletion";
import { removeMembershipInTx } from "@/lib/workspaces/members";
import { profileSchema, zodFieldErrors, type FieldErrors } from "@/lib/workspaces/schemas";

export type ProfileResult =
  | { ok: true; name: string }
  | {
      ok: false;
      error: "validation" | "not_found" | "unavailable";
      message: string;
      fieldErrors?: FieldErrors;
    };

export async function updateProfile(
  userId: string,
  input: { firstName: string; lastName: string },
): Promise<ProfileResult> {
  const parsed = profileSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: "validation",
      message: "Check the highlighted fields and try again.",
      fieldErrors: zodFieldErrors(parsed.error),
    };
  }

  const { firstName, lastName } = parsed.data;
  const name = formatPersonName(firstName, lastName);
  try {
    const updated = await db
      .update(users)
      .set({ firstName, lastName, name, updatedAt: new Date() })
      .where(and(eq(users.id, userId), isNull(users.deletedAt)))
      .returning({ id: users.id });
    if (updated.length === 0) {
      return { ok: false, error: "not_found", message: "We couldn’t find your account. Sign in again." };
    }
    return { ok: true, name };
  } catch {
    return {
      ok: false,
      error: "unavailable",
      message: "We couldn’t save your name. Check your connection and try again.",
    };
  }
}

export type AccountOverview = {
  firstName: string;
  lastName: string;
  email: string;
  hasPassword: boolean;
};

export async function getAccountOverview(userId: string): Promise<AccountOverview | null> {
  const [user] = await db
    .select({
      firstName: users.firstName,
      lastName: users.lastName,
      name: users.name,
      email: users.email,
      passwordHash: users.passwordHash,
    })
    .from(users)
    .where(and(eq(users.id, userId), isNull(users.deletedAt)))
    .limit(1);
  if (!user) return null;

  // Accounts created before first and last names were stored only have a display name.
  const [fallbackFirst = "", ...rest] = (user.name ?? "").split(" ");
  return {
    firstName: user.firstName ?? fallbackFirst,
    lastName: user.lastName ?? rest.join(" "),
    email: user.email,
    hasPassword: Boolean(user.passwordHash),
  };
}

export type ReauthInput = { password?: string; confirmEmail?: string };

export type ReauthResult =
  | { ok: true }
  | {
      ok: false;
      error: "wrong_password" | "wrong_email" | "rate_limited" | "not_found";
      message: string;
      retryAfterSeconds?: number;
    };

/**
 * Asks the person to prove it is really them before something that cannot be undone.
 * Accounts with a password must type it. Accounts that only use Google or GitHub have no
 * password to ask for, so they type their email address instead. Wrong answers are rate
 * limited per person.
 */
export async function confirmIdentity(
  userId: string,
  input: ReauthInput,
): Promise<ReauthResult> {
  const rate = await enforceAuthRateLimit({ scope: "account_reauth", subjects: [userId] });
  if (!rate.ok) {
    return {
      ok: false,
      error: "rate_limited",
      message: `Too many attempts. ${formatRetryGuidance(rate.retryAfterSeconds)}`,
      retryAfterSeconds: rate.retryAfterSeconds,
    };
  }

  const [user] = await db
    .select({ email: users.email, passwordHash: users.passwordHash })
    .from(users)
    .where(and(eq(users.id, userId), isNull(users.deletedAt)))
    .limit(1);
  if (!user) {
    return { ok: false, error: "not_found", message: "We couldn’t find your account. Sign in again." };
  }

  if (user.passwordHash) {
    const password = input.password ?? "";
    if (!password || !(await verifyPassword(user.passwordHash, password))) {
      return {
        ok: false,
        error: "wrong_password",
        message: "That password isn’t right. Check it and try again.",
      };
    }
    return { ok: true };
  }

  if (!input.confirmEmail || normalizeEmail(input.confirmEmail) !== normalizeEmail(user.email)) {
    return {
      ok: false,
      error: "wrong_email",
      message: "Type the email address on your account exactly to confirm.",
    };
  }
  return { ok: true };
}

export type AccountDeletionBlocker = {
  workspaceId: string;
  workspaceName: string;
  otherMembers: number;
};

/**
 * Workspaces that would be left without an owner. Owning a workspace with other people in
 * it blocks deletion until ownership moves or those people are removed.
 */
export async function listAccountDeletionBlockers(
  userId: string,
): Promise<AccountDeletionBlocker[]> {
  const owned = await db
    .select({ workspaceId: workspaces.id, workspaceName: workspaces.name })
    .from(workspaceMemberships)
    .innerJoin(workspaces, eq(workspaces.id, workspaceMemberships.workspaceId))
    .where(
      and(
        eq(workspaceMemberships.userId, userId),
        eq(workspaceMemberships.role, "owner"),
        eq(workspaceMemberships.status, "active"),
        isNull(workspaces.deletedAt),
      ),
    );

  const blockers: AccountDeletionBlocker[] = [];
  for (const workspace of owned) {
    const [others] = await db
      .select({ total: count() })
      .from(workspaceMemberships)
      .innerJoin(users, eq(users.id, workspaceMemberships.userId))
      .where(
        and(
          eq(workspaceMemberships.workspaceId, workspace.workspaceId),
          eq(workspaceMemberships.status, "active"),
          ne(workspaceMemberships.userId, userId),
          isNull(users.deletedAt),
        ),
      );
    const otherMembers = Number(others?.total ?? 0);
    if (otherMembers > 0) blockers.push({ ...workspace, otherMembers });
  }
  return blockers;
}

/** Workspaces only this person belongs to. They are deleted along with the account. */
export async function listSoleOwnedWorkspaces(
  userId: string,
): Promise<{ workspaceId: string; workspaceName: string }[]> {
  const owned = await db
    .select({ workspaceId: workspaces.id, workspaceName: workspaces.name })
    .from(workspaceMemberships)
    .innerJoin(workspaces, eq(workspaces.id, workspaceMemberships.workspaceId))
    .where(
      and(
        eq(workspaceMemberships.userId, userId),
        eq(workspaceMemberships.role, "owner"),
        eq(workspaceMemberships.status, "active"),
        isNull(workspaces.deletedAt),
      ),
    );
  const blocked = new Set((await listAccountDeletionBlockers(userId)).map((b) => b.workspaceId));
  return owned.filter((workspace) => !blocked.has(workspace.workspaceId));
}

class AccountBlockedError extends Error {}

export type DeleteAccountResult =
  | { ok: true; workspacesDeleted: number }
  | {
      ok: false;
      error:
        | "blocked"
        | "wrong_password"
        | "wrong_email"
        | "rate_limited"
        | "not_found"
        | "unavailable";
      message: string;
      blockers?: AccountDeletionBlocker[];
    };

/**
 * Closes a person's account.
 *  - They must confirm their identity first.
 *  - If they own a workspace that has other people, nothing happens until that is resolved.
 *  - Workspaces only they belong to are deleted with the standard waiting period.
 *  - They leave every other workspace. Comments, issues, and history they created stay,
 *    shown under a neutral name, because other people's work depends on them.
 *  - Their sign-in methods, saved settings, and notifications are erased and every
 *    signed-in browser is signed out.
 */
export async function deleteAccount(
  userId: string,
  input: ReauthInput,
  now: Date = new Date(),
): Promise<DeleteAccountResult> {
  const blockers = await listAccountDeletionBlockers(userId);
  if (blockers.length > 0) {
    const names = blockers.map((blocker) => blocker.workspaceName).join(", ");
    return {
      ok: false,
      error: "blocked",
      message: `You own ${names}, which still has other people in it. Make someone else the owner or remove them first.`,
      blockers,
    };
  }

  const identity = await confirmIdentity(userId, input);
  if (!identity.ok) {
    return { ok: false, error: identity.error, message: identity.message };
  }

  try {
    const tails: DeletedWorkspaceTail[] = [];
    await db.transaction(async (tx) => {
      const memberships = await tx
        .select({
          workspaceId: workspaceMemberships.workspaceId,
          role: workspaceMemberships.role,
        })
        .from(workspaceMemberships)
        .innerJoin(workspaces, eq(workspaces.id, workspaceMemberships.workspaceId))
        .where(
          and(
            eq(workspaceMemberships.userId, userId),
            eq(workspaceMemberships.status, "active"),
            isNull(workspaces.deletedAt),
          ),
        );

      for (const membership of memberships) {
        if (membership.role === "owner") {
          // Re-check under the workspace lock: someone may have joined since we looked.
          await tx
            .select({ id: workspaces.id })
            .from(workspaces)
            .where(eq(workspaces.id, membership.workspaceId))
            .for("update");
          const [others] = await tx
            .select({ total: count() })
            .from(workspaceMemberships)
            .innerJoin(users, eq(users.id, workspaceMemberships.userId))
            .where(
              and(
                eq(workspaceMemberships.workspaceId, membership.workspaceId),
                eq(workspaceMemberships.status, "active"),
                ne(workspaceMemberships.userId, userId),
                isNull(users.deletedAt),
              ),
            );
          if (Number(others?.total ?? 0) > 0) throw new AccountBlockedError();
          const closed = await closeWorkspaceInTx(tx, {
            workspaceId: membership.workspaceId,
            actorUserId: userId,
            now,
          });
          if (closed) tails.push(closed.tail);
        } else {
          await removeMembershipInTx(tx, { workspaceId: membership.workspaceId, userId });
        }
      }

      await tx.delete(accounts).where(eq(accounts.userId, userId));
      await tx.delete(sessions).where(eq(sessions.userId, userId));
      await tx.delete(authenticators).where(eq(authenticators.userId, userId));
      await tx.delete(passwordResetTokens).where(eq(passwordResetTokens.userId, userId));
      await tx.delete(userNotificationSettings).where(eq(userNotificationSettings.userId, userId));
      await tx.delete(notifications).where(eq(notifications.recipientUserId, userId));

      await tx
        .update(users)
        .set({
          name: "Former member",
          firstName: null,
          lastName: null,
          // The address is freed so the person can sign up again later.
          email: `deleted-${userId}@deleted.passoff.invalid`,
          emailVerified: null,
          image: null,
          passwordHash: null,
          platformRole: "user",
          sessionVersion: sql`${users.sessionVersion} + 1`,
          deletedAt: now,
          updatedAt: now,
        })
        .where(eq(users.id, userId));
    });

    for (const tail of tails) {
      await finishWorkspaceClosure(tail).catch(() => undefined);
    }
    return { ok: true, workspacesDeleted: tails.length };
  } catch (error) {
    if (error instanceof AccountBlockedError) {
      return {
        ok: false,
        error: "blocked",
        message:
          "Someone just joined a workspace you own. Make someone else the owner or remove them first.",
        blockers: await listAccountDeletionBlockers(userId),
      };
    }
    return {
      ok: false,
      error: "unavailable",
      message: "We couldn’t delete your account. Nothing was changed. Check your connection and try again.",
    };
  }
}
