import "server-only";

import { and, eq, sql } from "drizzle-orm";

import { db } from "@/db";
import { authRateLimits } from "@/db/schema";
import { hashRateLimitSubject } from "@/lib/auth/tokens";

/** Durable installation / SDK / analysis rate limits. */
export type InstallationRateLimitScope =
  | "installation_verify"
  | "sdk_session_exchange"
  | "sdk_issue_write"
  | "website_analysis_workspace"
  | "website_analysis_review"
  | "website_analysis_lock";

const LIMITS: Record<
  InstallationRateLimitScope,
  { maxAttempts: number; windowMs: number }
> = {
  // Enough for normal SDK checks; blocks abusive scanning of public keys.
  installation_verify: { maxAttempts: 60, windowMs: 15 * 60 * 1000 },
  sdk_session_exchange: { maxAttempts: 30, windowMs: 15 * 60 * 1000 },
  sdk_issue_write: { maxAttempts: 120, windowMs: 15 * 60 * 1000 },
  // User-initiated website analysis — keep OpenAI spend bounded.
  website_analysis_workspace: { maxAttempts: 30, windowMs: 60 * 60 * 1000 },
  website_analysis_review: { maxAttempts: 10, windowMs: 60 * 60 * 1000 },
  // Single-flight lock: first claim succeeds; further claims blocked for the window.
  website_analysis_lock: { maxAttempts: 1, windowMs: 2 * 60 * 1000 },
};

export type RateLimitResult =
  | { ok: true }
  | { ok: false; retryAfterSeconds: number };

export async function enforceInstallationRateLimit(options: {
  scope: InstallationRateLimitScope;
  subjects: string[];
}): Promise<RateLimitResult> {
  const config = LIMITS[options.scope];
  const subjectHash = hashRateLimitSubject([options.scope, ...options.subjects]);
  const now = new Date();

  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(authRateLimits)
      .where(
        and(
          eq(authRateLimits.scope, options.scope),
          eq(authRateLimits.subjectHash, subjectHash),
        ),
      )
      .for("update");

    if (!existing) {
      await tx.insert(authRateLimits).values({
        scope: options.scope,
        subjectHash,
        windowStartedAt: now,
        attemptCount: 1,
        blockedUntil: null,
        updatedAt: now,
      });
      return { ok: true };
    }

    if (existing.blockedUntil && existing.blockedUntil > now) {
      return {
        ok: false,
        retryAfterSeconds: Math.max(
          1,
          Math.ceil((existing.blockedUntil.getTime() - now.getTime()) / 1000),
        ),
      };
    }

    const windowExpired =
      now.getTime() - existing.windowStartedAt.getTime() >= config.windowMs;

    if (windowExpired) {
      await tx
        .update(authRateLimits)
        .set({
          windowStartedAt: now,
          attemptCount: 1,
          blockedUntil: null,
          updatedAt: now,
        })
        .where(eq(authRateLimits.id, existing.id));
      return { ok: true };
    }

    const nextCount = existing.attemptCount + 1;
    if (nextCount > config.maxAttempts) {
      const blockedUntil = new Date(
        existing.windowStartedAt.getTime() + config.windowMs,
      );
      await tx
        .update(authRateLimits)
        .set({
          attemptCount: nextCount,
          blockedUntil,
          updatedAt: now,
        })
        .where(eq(authRateLimits.id, existing.id));

      return {
        ok: false,
        retryAfterSeconds: Math.max(
          1,
          Math.ceil((blockedUntil.getTime() - now.getTime()) / 1000),
        ),
      };
    }

    await tx
      .update(authRateLimits)
      .set({
        attemptCount: nextCount,
        blockedUntil: null,
        updatedAt: now,
      })
      .where(eq(authRateLimits.id, existing.id));

    return { ok: true };
  });
}

export async function clearInstallationRateLimit(
  scope: InstallationRateLimitScope,
  subjects: string[],
) {
  const subjectHash = hashRateLimitSubject([scope, ...subjects]);
  await db
    .delete(authRateLimits)
    .where(
      and(
        eq(authRateLimits.scope, scope),
        eq(authRateLimits.subjectHash, subjectHash),
      ),
    );
}

export async function seedInstallationRateLimit(options: {
  scope: InstallationRateLimitScope;
  subjects: string[];
  attemptCount: number;
  windowStartedAt?: Date;
  blockedUntil?: Date | null;
}) {
  const subjectHash = hashRateLimitSubject([options.scope, ...options.subjects]);
  const now = options.windowStartedAt ?? new Date();
  await db
    .insert(authRateLimits)
    .values({
      scope: options.scope,
      subjectHash,
      windowStartedAt: now,
      attemptCount: options.attemptCount,
      blockedUntil: options.blockedUntil ?? null,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [authRateLimits.scope, authRateLimits.subjectHash],
      set: {
        windowStartedAt: now,
        attemptCount: options.attemptCount,
        blockedUntil: options.blockedUntil ?? null,
        updatedAt: sql`now()`,
      },
    });
}
