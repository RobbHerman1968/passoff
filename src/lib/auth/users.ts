import "server-only";

import { and, eq, isNull, sql } from "drizzle-orm";

import { db } from "@/db";
import { accounts, users } from "@/db/schema";
import { normalizeEmail } from "@/lib/auth/email";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { formatPersonName } from "@/lib/auth/person-name";

export type SafeAuthUser = {
  id: string;
  name: string | null;
  firstName: string | null;
  lastName: string | null;
  email: string;
  image: string | null;
  sessionVersion: number;
};

function toSafeUser(user: {
  id: string;
  name: string | null;
  firstName?: string | null;
  lastName?: string | null;
  email: string;
  image: string | null;
  sessionVersion: number;
}): SafeAuthUser {
  return {
    id: user.id,
    name: user.name,
    firstName: user.firstName ?? null,
    lastName: user.lastName ?? null,
    email: user.email,
    image: user.image,
    sessionVersion: user.sessionVersion,
  };
}

export async function findActiveUserByEmail(email: string) {
  const normalized = normalizeEmail(email);
  const [user] = await db
    .select()
    .from(users)
    .where(and(sql`lower(${users.email}) = ${normalized}`, isNull(users.deletedAt)))
    .limit(1);
  return user ?? null;
}

export async function findActiveUserById(userId: string) {
  const [user] = await db
    .select()
    .from(users)
    .where(and(eq(users.id, userId), isNull(users.deletedAt)))
    .limit(1);
  return user ?? null;
}

export async function authenticateWithPassword(
  email: string,
  password: string,
): Promise<SafeAuthUser | null> {
  const user = await findActiveUserByEmail(email);
  if (!user?.passwordHash) {
    // Constant-ish work: verify against a dummy hash shape is hard with Argon2;
    // still avoid distinguishing unknown users in response handling.
    return null;
  }

  const valid = await verifyPassword(user.passwordHash, password);
  if (!valid) {
    return null;
  }

  return toSafeUser(user);
}

export async function createCredentialsUser(options: {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
}): Promise<
  | { ok: true; user: SafeAuthUser }
  | { ok: false; reason: "duplicate" | "oauth_only" | "unavailable" }
> {
  const normalizedEmail = normalizeEmail(options.email);
  const firstName = options.firstName.trim();
  const lastName = options.lastName.trim();
  const displayName = formatPersonName(firstName, lastName);
  const passwordHash = await hashPassword(options.password);

  try {
    const created = await db.transaction(async (tx) => {
      const [existing] = await tx
        .select({
          id: users.id,
          passwordHash: users.passwordHash,
          deletedAt: users.deletedAt,
        })
        .from(users)
        .where(sql`lower(${users.email}) = ${normalizedEmail}`)
        .limit(1)
        .for("update");

      if (existing && !existing.deletedAt) {
        if (!existing.passwordHash) {
          const [oauthAccount] = await tx
            .select({ provider: accounts.provider })
            .from(accounts)
            .where(eq(accounts.userId, existing.id))
            .limit(1);

          if (oauthAccount) {
            return { kind: "oauth_only" as const };
          }
        }

        return { kind: "duplicate" as const };
      }

      const [user] = await tx
        .insert(users)
        .values({
          firstName,
          lastName,
          name: displayName,
          email: normalizedEmail,
          passwordHash,
          sessionVersion: 1,
        })
        .returning({
          id: users.id,
          name: users.name,
          firstName: users.firstName,
          lastName: users.lastName,
          email: users.email,
          image: users.image,
          sessionVersion: users.sessionVersion,
        });

      return { kind: "created" as const, user };
    });

    if (created.kind === "created") {
      return { ok: true, user: toSafeUser(created.user) };
    }

    if (created.kind === "oauth_only") {
      return { ok: false, reason: "oauth_only" };
    }

    return { ok: false, reason: "duplicate" };
  } catch {
    return { ok: false, reason: "unavailable" };
  }
}

export async function getUserSessionVersion(userId: string): Promise<number | null> {
  const user = await findActiveUserById(userId);
  return user?.sessionVersion ?? null;
}

/**
 * Auth state re-read on each JWT refresh so sessionVersion and platformRole
 * stay current. Authorization for admin operations still re-checks the database.
 */
export async function getUserAuthState(userId: string): Promise<{
  sessionVersion: number;
  platformRole: "user" | "admin";
  name: string | null;
} | null> {
  const user = await findActiveUserById(userId);
  if (!user) {
    return null;
  }

  return {
    sessionVersion: user.sessionVersion,
    platformRole: user.platformRole,
    name: user.name,
  };
}
