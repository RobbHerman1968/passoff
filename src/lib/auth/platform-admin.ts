import "server-only";

import { and, eq, isNull } from "drizzle-orm";

import { getValidSession } from "@/auth";
import { db } from "@/db";
import { users } from "@/db/schema";
import type { PlatformRole } from "@/lib/auth/platform-admin-provisioning";

export type PlatformAdminContext = {
  userId: string;
  email: string;
  name: string | null;
  platformRole: "admin";
};

export type PlatformAdminResult =
  | { ok: true; admin: PlatformAdminContext }
  | {
      ok: false;
      reason: "unauthenticated" | "forbidden" | "unavailable";
    };

/**
 * Load the current platform role from the database by user id.
 * Never trust a role supplied by the browser or JWT alone for authorization.
 */
export async function getStoredPlatformRole(
  userId: string,
): Promise<PlatformRole | null> {
  const [user] = await db
    .select({ platformRole: users.platformRole })
    .from(users)
    .where(and(eq(users.id, userId), isNull(users.deletedAt)))
    .limit(1);

  return user?.platformRole ?? null;
}

/**
 * Non-throwing check: true only when the signed-in user currently has
 * platformRole = admin in the database.
 */
export async function isPlatformAdmin(): Promise<boolean> {
  const session = await getValidSession();
  if (!session?.user?.id) {
    return false;
  }

  const role = await getStoredPlatformRole(session.user.id);
  return role === "admin";
}

/**
 * Require a valid session and a current database platformRole of admin.
 * Returns only the minimum safe administrator context.
 *
 * Does not authorize from session email alone, workspace ownership, or any
 * browser-supplied role claim. Entry to /admin only — not cross-workspace access.
 */
export async function requirePlatformAdmin(): Promise<PlatformAdminResult> {
  const session = await getValidSession();
  if (!session?.user?.id) {
    return { ok: false, reason: "unauthenticated" };
  }

  try {
    const [user] = await db
      .select({
        id: users.id,
        email: users.email,
        name: users.name,
        platformRole: users.platformRole,
      })
      .from(users)
      .where(and(eq(users.id, session.user.id), isNull(users.deletedAt)))
      .limit(1);

    if (!user) {
      return { ok: false, reason: "unavailable" };
    }

    if (user.platformRole !== "admin") {
      return { ok: false, reason: "forbidden" };
    }

    return {
      ok: true,
      admin: {
        userId: user.id,
        email: user.email,
        name: user.name,
        platformRole: "admin",
      },
    };
  } catch {
    return { ok: false, reason: "unavailable" };
  }
}
