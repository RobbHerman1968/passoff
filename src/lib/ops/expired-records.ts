import "server-only";

import { and, isNull, lt, or } from "drizzle-orm";

import { db } from "@/db";
import {
  authRateLimits,
  passwordResetTokens,
  reviewSessions,
  sdkExchangeCodes,
  telemetryViewExchanges,
  telemetryViewSessions,
  verificationExchanges,
  verificationSessions,
} from "@/db/schema";

/** Short-lived credentials are kept briefly after they stop working, then removed. */
export const CREDENTIAL_RETENTION_DAYS = 7;
/** Rate-limit counters only matter within their window. */
export const RATE_LIMIT_RETENTION_DAYS = 2;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Deletes expired sign-in helpers: password reset tokens, one-time launch and verification
 * codes, and review, usability, and verification sessions. None of these hold customer work.
 * Safe to run repeatedly and in parallel; a row is only ever removed after it has expired.
 */
export async function purgeExpiredShortLivedRecords(now = new Date()) {
  const credentialCutoff = new Date(now.getTime() - CREDENTIAL_RETENTION_DAYS * DAY_MS);
  const rateLimitCutoff = new Date(now.getTime() - RATE_LIMIT_RETENTION_DAYS * DAY_MS);

  const removed = async (promise: Promise<Array<unknown>>) => (await promise).length;

  return {
    passwordResetTokens: await removed(
      db
        .delete(passwordResetTokens)
        .where(lt(passwordResetTokens.expiresAt, credentialCutoff))
        .returning({ id: passwordResetTokens.id }),
    ),
    sdkExchangeCodes: await removed(
      db
        .delete(sdkExchangeCodes)
        .where(lt(sdkExchangeCodes.expiresAt, credentialCutoff))
        .returning({ id: sdkExchangeCodes.id }),
    ),
    reviewSessions: await removed(
      db
        .delete(reviewSessions)
        .where(lt(reviewSessions.expiresAt, credentialCutoff))
        .returning({ id: reviewSessions.id }),
    ),
    telemetryViewExchanges: await removed(
      db
        .delete(telemetryViewExchanges)
        .where(lt(telemetryViewExchanges.expiresAt, credentialCutoff))
        .returning({ id: telemetryViewExchanges.id }),
    ),
    telemetryViewSessions: await removed(
      db
        .delete(telemetryViewSessions)
        .where(lt(telemetryViewSessions.expiresAt, credentialCutoff))
        .returning({ id: telemetryViewSessions.id }),
    ),
    verificationExchanges: await removed(
      db
        .delete(verificationExchanges)
        .where(lt(verificationExchanges.expiresAt, credentialCutoff))
        .returning({ id: verificationExchanges.id }),
    ),
    verificationSessions: await removed(
      db
        .delete(verificationSessions)
        .where(lt(verificationSessions.expiresAt, credentialCutoff))
        .returning({ id: verificationSessions.id }),
    ),
    rateLimits: await removed(
      db
        .delete(authRateLimits)
        .where(
          and(
            lt(authRateLimits.updatedAt, rateLimitCutoff),
            or(isNull(authRateLimits.blockedUntil), lt(authRateLimits.blockedUntil, now)),
          ),
        )
        .returning({ id: authRateLimits.id }),
    ),
  };
}
