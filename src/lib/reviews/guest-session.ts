import "server-only";

import { eq } from "drizzle-orm";

import { db } from "@/db";
import { reviewSessions, shareLinks } from "@/db/schema";
import { hashToken } from "@/lib/auth/tokens";

export const REVIEW_SESSION_COOKIE = "passoff_review_session";

export type GuestReviewSession = {
  sessionId: string;
  workspaceId: string;
  reviewId: string;
  shareLinkId: string;
  guestIdentityId: string | null;
};

export type GuestSessionLookup =
  | { ok: true; session: GuestReviewSession }
  | { ok: false; reason: "missing" | "invalid" | "expired" | "revoked" };

function readSessionToken(request: Request): string | null {
  const cookieHeader = request.headers.get("cookie");
  if (!cookieHeader) return null;

  for (const part of cookieHeader.split(";")) {
    const [rawName, ...rest] = part.trim().split("=");
    if (rawName !== REVIEW_SESSION_COOKIE) continue;
    const value = rest.join("=").trim();
    if (!value) return null;
    try {
      return decodeURIComponent(value);
    } catch {
      return value;
    }
  }
  return null;
}

/**
 * Resolve a guest review session from the request cookie.
 * Possession of a review or video identifier alone is never enough.
 */
export async function resolveGuestReviewSession(
  request: Request,
): Promise<GuestSessionLookup> {
  const rawToken = readSessionToken(request);
  if (!rawToken) {
    return { ok: false, reason: "missing" };
  }

  const tokenHash = hashToken(rawToken);
  const now = new Date();

  const [row] = await db
    .select({
      sessionId: reviewSessions.id,
      workspaceId: reviewSessions.workspaceId,
      reviewId: reviewSessions.reviewId,
      shareLinkId: reviewSessions.shareLinkId,
      guestIdentityId: reviewSessions.guestIdentityId,
      sessionExpiresAt: reviewSessions.expiresAt,
      sessionRevokedAt: reviewSessions.revokedAt,
      shareExpiresAt: shareLinks.expiresAt,
      shareRevokedAt: shareLinks.revokedAt,
    })
    .from(reviewSessions)
    .innerJoin(shareLinks, eq(shareLinks.id, reviewSessions.shareLinkId))
    .where(eq(reviewSessions.tokenHash, tokenHash))
    .limit(1);

  if (!row) {
    return { ok: false, reason: "invalid" };
  }

  if (row.sessionRevokedAt || row.shareRevokedAt) {
    return { ok: false, reason: "revoked" };
  }

  if (
    row.sessionExpiresAt <= now ||
    (row.shareExpiresAt !== null && row.shareExpiresAt <= now)
  ) {
    return { ok: false, reason: "expired" };
  }

  return {
    ok: true,
    session: {
      sessionId: row.sessionId,
      workspaceId: row.workspaceId,
      reviewId: row.reviewId,
      shareLinkId: row.shareLinkId,
      guestIdentityId: row.guestIdentityId,
    },
  };
}
