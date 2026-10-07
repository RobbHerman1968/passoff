import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { db } from "@/db";
import { authRateLimits, passwordResetTokens } from "@/db/schema";
import { purgeExpiredShortLivedRecords } from "@/lib/ops/expired-records";
import { createOwnerContext } from "@/test/workspace-fixtures";

// Needs TEST_DATABASE_URL. Never uses DATABASE_URL.
describe("purgeExpiredShortLivedRecords", () => {
  it("removes long-expired reset tokens and idle rate limits but keeps live ones", async () => {
    const owner = await createOwnerContext("expiredpurge");
    const day = 24 * 60 * 60 * 1000;
    const now = new Date();
    const tag = `purge-${Date.now()}-${Math.random().toString(16).slice(2)}`;

    const [expired] = await db
      .insert(passwordResetTokens)
      .values({
        userId: owner.userId,
        tokenHash: `${tag}-old`,
        expiresAt: new Date(now.getTime() - 10 * day),
      })
      .returning({ id: passwordResetTokens.id });
    const [live] = await db
      .insert(passwordResetTokens)
      .values({
        userId: owner.userId,
        tokenHash: `${tag}-live`,
        expiresAt: new Date(now.getTime() + day),
      })
      .returning({ id: passwordResetTokens.id });
    const [justExpired] = await db
      .insert(passwordResetTokens)
      .values({
        userId: owner.userId,
        tokenHash: `${tag}-recent`,
        expiresAt: new Date(now.getTime() - 1 * day),
      })
      .returning({ id: passwordResetTokens.id });

    const [staleLimit] = await db
      .insert(authRateLimits)
      .values({
        scope: "sign_up",
        subjectHash: `${tag}-stale`,
        windowStartedAt: new Date(now.getTime() - 5 * day),
        attemptCount: 3,
        updatedAt: new Date(now.getTime() - 5 * day),
      })
      .returning({ id: authRateLimits.id });
    const [stillBlocked] = await db
      .insert(authRateLimits)
      .values({
        scope: "sign_up",
        subjectHash: `${tag}-blocked`,
        windowStartedAt: new Date(now.getTime() - 5 * day),
        attemptCount: 9,
        blockedUntil: new Date(now.getTime() + day),
        updatedAt: new Date(now.getTime() - 5 * day),
      })
      .returning({ id: authRateLimits.id });

    const first = await purgeExpiredShortLivedRecords(now);
    expect(first.passwordResetTokens).toBeGreaterThanOrEqual(1);
    expect(first.rateLimits).toBeGreaterThanOrEqual(1);

    const stillThere = async (id: string, table: typeof passwordResetTokens | typeof authRateLimits) =>
      (await db.select({ id: table.id }).from(table).where(eq(table.id, id))).length === 1;

    expect(await stillThere(expired.id, passwordResetTokens)).toBe(false);
    expect(await stillThere(live.id, passwordResetTokens)).toBe(true);
    expect(await stillThere(justExpired.id, passwordResetTokens)).toBe(true);
    expect(await stillThere(staleLimit.id, authRateLimits)).toBe(false);
    expect(await stillThere(stillBlocked.id, authRateLimits)).toBe(true);

    // Running it again is harmless.
    await expect(purgeExpiredShortLivedRecords(now)).resolves.toBeTruthy();
  });
});
