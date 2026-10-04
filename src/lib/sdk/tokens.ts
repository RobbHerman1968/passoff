import "server-only";

import { randomBytes } from "node:crypto";

import { hashToken } from "@/lib/auth/tokens";

export const REVIEW_SESSION_TTL_MS = 12 * 60 * 60 * 1000;
export const SESSION_TOKEN_BYTES = 32;

export function createRawShareSessionToken(
  ttlMs: number,
  shareExpiresAt: Date | null,
): { rawToken: string; tokenHash: string; expiresAt: Date } {
  const rawToken = randomBytes(SESSION_TOKEN_BYTES).toString("base64url");
  const candidate = new Date(Date.now() + ttlMs);
  const expiresAt =
    shareExpiresAt && shareExpiresAt < candidate ? shareExpiresAt : candidate;
  return {
    rawToken,
    tokenHash: hashToken(rawToken),
    expiresAt,
  };
}
