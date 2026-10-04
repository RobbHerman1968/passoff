import "server-only";

import { and, eq, sql } from "drizzle-orm";

import { db } from "@/db";
import { authRateLimits } from "@/db/schema";
import { hashRateLimitSubject } from "@/lib/auth/tokens";

/**
 * Durable auth rate limits (PostgreSQL). Documented defaults:
 *
 * | Scope                 | Max attempts | Window   | Cool-down after limit |
 * | --------------------- | ------------ | -------- | --------------------- |
 * | credentials_sign_in   | 10           | 15 min   | remaining window      |
 * | sign_up               | 5            | 1 hour   | remaining window      |
 * | forgot_password       | 5            | 1 hour   | remaining window      |
 * | reset_password        | 10           | 1 hour   | remaining window      |
 *
 * Subjects are hashed (email + coarse request fingerprint) so counters are
 * privacy-conscious and do not permanently lock an account.
 */
export type RateLimitScope =
  | "credentials_sign_in"
  | "sign_up"
  | "forgot_password"
  | "reset_password";

const LIMITS: Record<
  RateLimitScope,
  { maxAttempts: number; windowMs: number }
> = {
  credentials_sign_in: { maxAttempts: 10, windowMs: 15 * 60 * 1000 },
  sign_up: { maxAttempts: 5, windowMs: 60 * 60 * 1000 },
  forgot_password: { maxAttempts: 5, windowMs: 60 * 60 * 1000 },
  reset_password: { maxAttempts: 10, windowMs: 60 * 60 * 1000 },
};

export type RateLimitResult =
  | { ok: true }
  | { ok: false; retryAfterSeconds: number };

export async function enforceAuthRateLimit(options: {
  scope: RateLimitScope;
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

export function formatRetryGuidance(retryAfterSeconds: number): string {
  if (retryAfterSeconds < 60) {
    return `Please wait about ${retryAfterSeconds} seconds and try again.`;
  }

  const minutes = Math.ceil(retryAfterSeconds / 60);
  return `Please wait about ${minutes} minute${minutes === 1 ? "" : "s"} and try again.`;
}

/** Test helper: clear a rate-limit bucket. */
export async function clearAuthRateLimit(scope: RateLimitScope, subjects: string[]) {
  const subjectHash = hashRateLimitSubject([scope, ...subjects]);
  await db
    .delete(authRateLimits)
    .where(
      and(eq(authRateLimits.scope, scope), eq(authRateLimits.subjectHash, subjectHash)),
    );
}

/** Test helper: force a near-limit state. */
export async function seedAuthRateLimit(options: {
  scope: RateLimitScope;
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
