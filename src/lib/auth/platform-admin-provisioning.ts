import { and, eq, isNull, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import type * as schema from "@/db/schema";
import { platformAuditEvents, users } from "@/db/schema";
import { normalizeEmail } from "@/lib/auth/email";

export type PlatformRole = "user" | "admin";

export const PLATFORM_ADMIN_ACTOR_SYSTEM_COMMAND = "system command";

export const PLATFORM_AUDIT_ACTION = {
  grantAdmin: "platform.admin.grant",
  revokeAdmin: "platform.admin.revoke",
} as const;

type AppDatabase = NodePgDatabase<typeof schema>;

export type PlatformAdminProvisionResult =
  | {
      ok: true;
      userId: string;
      email: string;
      previousRole: PlatformRole;
      platformRole: PlatformRole;
      changed: boolean;
    }
  | {
      ok: false;
      reason: "not_found" | "unavailable";
      message: string;
    };

function parseEmailFlag(argv: string[]): string | null {
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--email") {
      const value = argv[index + 1];
      return typeof value === "string" ? value : null;
    }
    if (arg.startsWith("--email=")) {
      return arg.slice("--email=".length);
    }
  }
  return null;
}

export function readEmailArgument(argv: string[] = process.argv.slice(2)): string {
  const raw = parseEmailFlag(argv);
  if (!raw || !raw.trim()) {
    throw new Error("Provide an email with --email user@example.com");
  }
  return normalizeEmail(raw);
}

async function findActiveUserByExactEmail(db: AppDatabase, email: string) {
  const normalized = normalizeEmail(email);
  const [user] = await db
    .select({
      id: users.id,
      email: users.email,
      platformRole: users.platformRole,
    })
    .from(users)
    .where(and(sql`lower(${users.email}) = ${normalized}`, isNull(users.deletedAt)))
    .limit(1);

  return user ?? null;
}

async function recordPlatformAudit(
  db: AppDatabase,
  input: {
    action: string;
    targetUserId: string;
    targetEmail: string;
    actor: string;
    data?: Record<string, unknown>;
  },
) {
  await db.insert(platformAuditEvents).values({
    action: input.action,
    targetUserId: input.targetUserId,
    targetEmail: input.targetEmail,
    actor: input.actor,
    data: input.data ?? {},
  });
}

/**
 * Grant platform administrator access to an existing user by exact normalized email.
 * Idempotent when the user is already an admin. Never creates users or credentials.
 */
export async function grantPlatformAdmin(
  db: AppDatabase,
  email: string,
  actor: string = PLATFORM_ADMIN_ACTOR_SYSTEM_COMMAND,
): Promise<PlatformAdminProvisionResult> {
  const normalized = normalizeEmail(email);

  try {
    const user = await findActiveUserByExactEmail(db, normalized);
    if (!user) {
      return {
        ok: false,
        reason: "not_found",
        message: `No user found for email ${normalized}. Ask them to sign up, then run this command again.`,
      };
    }

    if (user.platformRole === "admin") {
      return {
        ok: true,
        userId: user.id,
        email: user.email,
        previousRole: "admin",
        platformRole: "admin",
        changed: false,
      };
    }

    const [updated] = await db
      .update(users)
      .set({
        platformRole: "admin",
        updatedAt: new Date(),
      })
      .where(and(eq(users.id, user.id), isNull(users.deletedAt)))
      .returning({
        id: users.id,
        email: users.email,
        platformRole: users.platformRole,
      });

    if (!updated) {
      return {
        ok: false,
        reason: "unavailable",
        message: "Could not update the user right now. Try again shortly.",
      };
    }

    await recordPlatformAudit(db, {
      action: PLATFORM_AUDIT_ACTION.grantAdmin,
      targetUserId: updated.id,
      targetEmail: updated.email,
      actor,
      data: { previousRole: user.platformRole, platformRole: updated.platformRole },
    });

    return {
      ok: true,
      userId: updated.id,
      email: updated.email,
      previousRole: user.platformRole,
      platformRole: updated.platformRole,
      changed: true,
    };
  } catch {
    return {
      ok: false,
      reason: "unavailable",
      message: "Could not update the user right now. Try again shortly.",
    };
  }
}

/**
 * Revoke platform administrator access. Idempotent when the user is already an ordinary user.
 */
export async function revokePlatformAdmin(
  db: AppDatabase,
  email: string,
  actor: string = PLATFORM_ADMIN_ACTOR_SYSTEM_COMMAND,
): Promise<PlatformAdminProvisionResult> {
  const normalized = normalizeEmail(email);

  try {
    const user = await findActiveUserByExactEmail(db, normalized);
    if (!user) {
      return {
        ok: false,
        reason: "not_found",
        message: `No user found for email ${normalized}.`,
      };
    }

    if (user.platformRole === "user") {
      return {
        ok: true,
        userId: user.id,
        email: user.email,
        previousRole: "user",
        platformRole: "user",
        changed: false,
      };
    }

    const [updated] = await db
      .update(users)
      .set({
        platformRole: "user",
        updatedAt: new Date(),
      })
      .where(and(eq(users.id, user.id), isNull(users.deletedAt)))
      .returning({
        id: users.id,
        email: users.email,
        platformRole: users.platformRole,
      });

    if (!updated) {
      return {
        ok: false,
        reason: "unavailable",
        message: "Could not update the user right now. Try again shortly.",
      };
    }

    await recordPlatformAudit(db, {
      action: PLATFORM_AUDIT_ACTION.revokeAdmin,
      targetUserId: updated.id,
      targetEmail: updated.email,
      actor,
      data: { previousRole: user.platformRole, platformRole: updated.platformRole },
    });

    return {
      ok: true,
      userId: updated.id,
      email: updated.email,
      previousRole: user.platformRole,
      platformRole: updated.platformRole,
      changed: true,
    };
  } catch {
    return {
      ok: false,
      reason: "unavailable",
      message: "Could not update the user right now. Try again shortly.",
    };
  }
}
