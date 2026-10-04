import "server-only";

import { createHash, randomBytes } from "node:crypto";

/** Raw reset tokens are 32 bytes (256 bits) of CSPRNG entropy, encoded as base64url. */
export const PASSWORD_RESET_TOKEN_BYTES = 32;

/** Reset links expire after 60 minutes. */
export const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000;

export function createPasswordResetToken(): {
  rawToken: string;
  tokenHash: string;
  expiresAt: Date;
} {
  const rawToken = randomBytes(PASSWORD_RESET_TOKEN_BYTES).toString("base64url");
  return {
    rawToken,
    tokenHash: hashToken(rawToken),
    expiresAt: new Date(Date.now() + PASSWORD_RESET_TTL_MS),
  };
}

export function hashToken(rawToken: string): string {
  return createHash("sha256").update(rawToken).digest("hex");
}

export function hashRateLimitSubject(parts: string[]): string {
  return createHash("sha256").update(parts.join("|")).digest("hex");
}
