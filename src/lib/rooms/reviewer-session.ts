import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

import { hashShareToken } from "@/lib/rooms/crypto";

export const REVIEWER_SESSION_COOKIE = "passoff_reviewer";
export const REVIEWER_SESSION_MAX_AGE_SEC = 60 * 60 * 24 * 14; // 14 days

export type ReviewerSessionPayload = {
  reviewerId: string;
  roomId: string;
  /** SHA-256 hex of the share token — binds credential to this share link. */
  shareTokenHash: string;
  exp: number;
};

type LegacyReviewerSessionPayload = Omit<ReviewerSessionPayload, "roomId"> & {
  projectId: string;
};

export class ReviewerSessionError extends Error {
  status: number;
  constructor(message: string, status = 401) {
    super(message);
    this.name = "ReviewerSessionError";
    this.status = status;
  }
}

/**
 * Signing secret for public-reviewer credentials.
 * Prefers REVIEWER_SESSION_SECRET; falls back to AUTH_SECRET in development only.
 */
export function getReviewerSessionSecret(): string {
  const dedicated = process.env.REVIEWER_SESSION_SECRET?.trim();
  if (dedicated) return dedicated;

  const authSecret = process.env.AUTH_SECRET?.trim();
  const isProd = process.env.NODE_ENV === "production" || process.env.VERCEL === "1";
  if (isProd) {
    throw new Error(
      "REVIEWER_SESSION_SECRET is required in production for public reviewer sessions.",
    );
  }
  if (authSecret) return authSecret;

  // Local/test fallback — never used in production (guarded above).
  return "passoff-dev-reviewer-session-secret";
}

function b64url(input: Buffer | string) {
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(input, "utf8");
  return buf.toString("base64url");
}

function fromB64url(value: string) {
  return Buffer.from(value, "base64url");
}

function sign(body: string, secret: string) {
  return createHmac("sha256", secret).update(body).digest("base64url");
}

export function createReviewerSessionToken(input: {
  reviewerId: string;
  roomId: string;
  shareToken: string;
  maxAgeSec?: number;
  nowMs?: number;
}): string {
  const now = input.nowMs ?? Date.now();
  const maxAgeSec = input.maxAgeSec ?? REVIEWER_SESSION_MAX_AGE_SEC;
  const payload: ReviewerSessionPayload = {
    reviewerId: input.reviewerId,
    roomId: input.roomId,
    shareTokenHash: hashShareToken(input.shareToken),
    exp: Math.floor(now / 1000) + maxAgeSec,
  };
  const body = b64url(JSON.stringify(payload));
  const sig = sign(body, getReviewerSessionSecret());
  return `${body}.${sig}`;
}

export function verifyReviewerSessionToken(
  token: string | null | undefined,
  expected: { roomId: string; shareToken: string },
  nowMs = Date.now(),
): ReviewerSessionPayload {
  if (!token || typeof token !== "string" || !token.includes(".")) {
    throw new ReviewerSessionError("Reviewer session required.", 401);
  }

  const [body, sig] = token.split(".");
  if (!body || !sig) {
    throw new ReviewerSessionError("Invalid reviewer session.", 401);
  }

  let secret: string;
  try {
    secret = getReviewerSessionSecret();
  } catch {
    throw new ReviewerSessionError("Reviewer sessions are unavailable.", 503);
  }

  const expectedSig = sign(body, secret);
  const left = Buffer.from(sig);
  const right = Buffer.from(expectedSig);
  if (left.length !== right.length || !timingSafeEqual(left, right)) {
    throw new ReviewerSessionError("Invalid reviewer session.", 401);
  }

  let rawPayload: ReviewerSessionPayload | LegacyReviewerSessionPayload;
  try {
    rawPayload = JSON.parse(fromB64url(body).toString("utf8")) as
      | ReviewerSessionPayload
      | LegacyReviewerSessionPayload;
  } catch {
    throw new ReviewerSessionError("Invalid reviewer session.", 401);
  }

  if (!rawPayload || typeof rawPayload !== "object") {
    throw new ReviewerSessionError("Invalid reviewer session.", 401);
  }
  const roomId =
    "roomId" in rawPayload && typeof rawPayload.roomId === "string"
      ? rawPayload.roomId
      : "projectId" in rawPayload && typeof rawPayload.projectId === "string"
        ? rawPayload.projectId
        : null;
  if (
    typeof rawPayload.reviewerId !== "string" ||
    roomId === null ||
    typeof rawPayload.shareTokenHash !== "string" ||
    typeof rawPayload.exp !== "number"
  ) {
    throw new ReviewerSessionError("Invalid reviewer session.", 401);
  }
  const payload: ReviewerSessionPayload = {
    reviewerId: rawPayload.reviewerId,
    roomId,
    shareTokenHash: rawPayload.shareTokenHash,
    exp: rawPayload.exp,
  };

  if (payload.exp * 1000 <= nowMs) {
    throw new ReviewerSessionError("Reviewer session expired.", 401);
  }

  if (payload.roomId !== expected.roomId) {
    throw new ReviewerSessionError("Reviewer session does not match this room.", 403);
  }

  const expectedHash = hashShareToken(expected.shareToken);
  const a = Buffer.from(payload.shareTokenHash, "utf8");
  const b = Buffer.from(expectedHash, "utf8");
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    throw new ReviewerSessionError("Reviewer session does not match this share link.", 403);
  }

  return payload;
}

export function reviewerSessionCookieOptions(shareToken: string) {
  return {
    httpOnly: true as const,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: `/api/public/${encodeURIComponent(shareToken)}`,
    maxAge: REVIEWER_SESSION_MAX_AGE_SEC,
  };
}

export function readReviewerSessionCookie(cookieHeader: string | null): string | null {
  if (!cookieHeader) return null;
  const parts = cookieHeader.split(";").map((p) => p.trim());
  for (const part of parts) {
    const eq = part.indexOf("=");
    if (eq <= 0) continue;
    const name = part.slice(0, eq).trim();
    if (name !== REVIEWER_SESSION_COOKIE) continue;
    return decodeURIComponent(part.slice(eq + 1).trim());
  }
  return null;
}
