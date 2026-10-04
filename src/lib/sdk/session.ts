import "server-only";

import { and, eq, isNull } from "drizzle-orm";

import { db } from "@/db";
import {
  guestIdentities,
  projectEnvironments,
  projects,
  reviewSessions,
  reviews,
  sdkExchangeCodes,
  shareLinks,
} from "@/db/schema";
import { hashToken } from "@/lib/auth/tokens";
import { isOriginAllowed, normalizeOrigin } from "@/lib/installations/origin";
import { isPublicInstallationKey } from "@/lib/installations/snippet";
import { enforceInstallationRateLimit } from "@/lib/installations/rate-limit";
import {
  REVIEW_SESSION_TTL_MS,
  createRawShareSessionToken,
} from "@/lib/sdk/tokens";

export type SdkSession = {
  sessionId: string;
  workspaceId: string;
  projectId: string;
  environmentId: string;
  reviewId: string;
  shareLinkId: string;
  guestIdentityId: string;
  guestName: string;
  canComment: boolean;
  allowedOrigin: string;
  privateSelectors: string[];
  reviewStatus: "draft" | "open" | "closed";
};

export type SdkSessionLookup =
  | { ok: true; session: SdkSession; corsOrigin: string }
  | {
      ok: false;
      reason:
        | "missing"
        | "invalid"
        | "expired"
        | "revoked"
        | "origin"
        | "closed"
        | "archived"
        | "disabled"
        | "commenting_disabled";
      corsOrigin?: string;
      status: 401 | 403 | 404;
    };

export type ExchangeResult =
  | {
      ok: true;
      sessionToken: string;
      expiresAt: string;
      canComment: boolean;
      reviewerName: string;
      privateSelectors: string[];
      corsOrigin: string;
    }
  | {
      ok: false;
      status: 400 | 403 | 404 | 429;
      code?:
        | "invalid"
        | "expired"
        | "revoked"
        | "origin"
        | "closed"
        | "archived"
        | "disabled"
        | "rate_limited";
      corsOrigin?: string;
      retryAfterSeconds?: number;
    };

function readBearerToken(request: Request): string | null {
  const header = request.headers.get("authorization");
  if (!header) return null;
  const match = /^Bearer\s+(\S+)$/i.exec(header.trim());
  return match?.[1] ?? null;
}

export async function exchangeSdkSession(options: {
  installationKey: string;
  exchangeCode: string;
  headerOrigin: string | null;
  rateLimitSubjects: string[];
}): Promise<ExchangeResult> {
  if (!isPublicInstallationKey(options.installationKey)) {
    return { ok: false, status: 404, code: "invalid" };
  }

  const header = normalizeOrigin(options.headerOrigin);
  if (!header.ok) {
    return { ok: false, status: 403, code: "origin" };
  }

  const rate = await enforceInstallationRateLimit({
    scope: "sdk_session_exchange",
    subjects: [
      options.installationKey,
      header.origin,
      ...options.rateLimitSubjects,
    ],
  });
  if (!rate.ok) {
    return {
      ok: false,
      status: 429,
      code: "rate_limited",
      retryAfterSeconds: rate.retryAfterSeconds,
      corsOrigin: header.origin,
    };
  }

  const codeHash = hashToken(options.exchangeCode);
  const now = new Date();

  try {
    return await db.transaction(async (tx) => {
      const [locked] = await tx
        .select({
          exchangeId: sdkExchangeCodes.id,
          workspaceId: sdkExchangeCodes.workspaceId,
          reviewId: sdkExchangeCodes.reviewId,
          shareLinkId: sdkExchangeCodes.shareLinkId,
          guestIdentityId: sdkExchangeCodes.guestIdentityId,
          environmentId: sdkExchangeCodes.environmentId,
          allowedOrigin: sdkExchangeCodes.allowedOrigin,
          expiresAt: sdkExchangeCodes.expiresAt,
          consumedAt: sdkExchangeCodes.consumedAt,
        })
        .from(sdkExchangeCodes)
        .where(eq(sdkExchangeCodes.codeHash, codeHash))
        .limit(1)
        .for("update");

      if (!locked) {
        return { ok: false as const, status: 404 as const, code: "invalid" as const };
      }

      const [row] = await tx
        .select({
          exchangeId: sdkExchangeCodes.id,
          workspaceId: sdkExchangeCodes.workspaceId,
          reviewId: sdkExchangeCodes.reviewId,
          shareLinkId: sdkExchangeCodes.shareLinkId,
          guestIdentityId: sdkExchangeCodes.guestIdentityId,
          environmentId: sdkExchangeCodes.environmentId,
          allowedOrigin: sdkExchangeCodes.allowedOrigin,
          expiresAt: sdkExchangeCodes.expiresAt,
          consumedAt: sdkExchangeCodes.consumedAt,
          shareRevokedAt: shareLinks.revokedAt,
          shareExpiresAt: shareLinks.expiresAt,
          canComment: shareLinks.canComment,
          reviewStatus: reviews.status,
          reviewArchivedAt: reviews.archivedAt,
          projectId: reviews.projectId,
          projectStatus: projects.status,
          publicKey: projectEnvironments.publicKey,
          installationEnabled: projectEnvironments.isEnabled,
          envAllowedOrigins: projectEnvironments.allowedOrigins,
          consentSettings: projectEnvironments.consentSettings,
          guestName: guestIdentities.name,
        })
        .from(sdkExchangeCodes)
        .innerJoin(shareLinks, eq(shareLinks.id, sdkExchangeCodes.shareLinkId))
        .innerJoin(reviews, eq(reviews.id, sdkExchangeCodes.reviewId))
        .innerJoin(projects, eq(projects.id, reviews.projectId))
        .innerJoin(
          projectEnvironments,
          eq(projectEnvironments.id, sdkExchangeCodes.environmentId),
        )
        .innerJoin(
          guestIdentities,
          eq(guestIdentities.id, sdkExchangeCodes.guestIdentityId),
        )
        .where(eq(sdkExchangeCodes.id, locked.exchangeId))
        .limit(1);

      if (!row) {
        return { ok: false as const, status: 404 as const, code: "invalid" as const };
      }

      const corsOrigin = header.origin;

      if (row.publicKey !== options.installationKey) {
        return {
          ok: false as const,
          status: 403 as const,
          code: "invalid" as const,
          corsOrigin,
        };
      }

      if (row.consumedAt) {
        return {
          ok: false as const,
          status: 403 as const,
          code: "expired" as const,
          corsOrigin,
        };
      }

      if (row.expiresAt <= now) {
        return {
          ok: false as const,
          status: 403 as const,
          code: "expired" as const,
          corsOrigin,
        };
      }

      if (row.shareRevokedAt) {
        return {
          ok: false as const,
          status: 403 as const,
          code: "revoked" as const,
          corsOrigin,
        };
      }

      if (row.shareExpiresAt && row.shareExpiresAt <= now) {
        return {
          ok: false as const,
          status: 403 as const,
          code: "expired" as const,
          corsOrigin,
        };
      }

      if (row.reviewArchivedAt || row.projectStatus === "archived") {
        return {
          ok: false as const,
          status: 403 as const,
          code: "archived" as const,
          corsOrigin,
        };
      }

      if (row.reviewStatus === "closed") {
        return {
          ok: false as const,
          status: 403 as const,
          code: "closed" as const,
          corsOrigin,
        };
      }

      if (!row.installationEnabled) {
        return {
          ok: false as const,
          status: 403 as const,
          code: "disabled" as const,
          corsOrigin,
        };
      }

      if (
        header.origin !== row.allowedOrigin ||
        !isOriginAllowed(header.origin, row.envAllowedOrigins)
      ) {
        return {
          ok: false as const,
          status: 403 as const,
          code: "origin" as const,
          corsOrigin,
        };
      }

      await tx
        .update(sdkExchangeCodes)
        .set({ consumedAt: now })
        .where(
          and(
            eq(sdkExchangeCodes.id, row.exchangeId),
            isNull(sdkExchangeCodes.consumedAt),
          ),
        );

      const { rawToken, tokenHash, expiresAt } = createRawShareSessionToken(
        REVIEW_SESSION_TTL_MS,
        row.shareExpiresAt,
      );

      await tx.insert(reviewSessions).values({
        workspaceId: row.workspaceId,
        reviewId: row.reviewId,
        shareLinkId: row.shareLinkId,
        guestIdentityId: row.guestIdentityId,
        tokenHash,
        allowedOrigin: row.allowedOrigin,
        expiresAt,
        lastSeenAt: now,
        createdAt: now,
      });

      return {
        ok: true as const,
        sessionToken: rawToken,
        expiresAt: expiresAt.toISOString(),
        canComment: row.canComment,
        reviewerName: row.guestName,
        privateSelectors: row.consentSettings?.privateSelectors ?? [],
        corsOrigin,
      };
    });
  } catch {
    return { ok: false, status: 404, code: "invalid" };
  }
}

export async function resolveSdkSession(
  request: Request,
): Promise<SdkSessionLookup> {
  const rawToken = readBearerToken(request);
  if (!rawToken) {
    return { ok: false, reason: "missing", status: 401 };
  }

  const header = normalizeOrigin(request.headers.get("Origin"));
  if (!header.ok) {
    return { ok: false, reason: "origin", status: 403 };
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
      allowedOrigin: reviewSessions.allowedOrigin,
      sessionExpiresAt: reviewSessions.expiresAt,
      sessionRevokedAt: reviewSessions.revokedAt,
      shareExpiresAt: shareLinks.expiresAt,
      shareRevokedAt: shareLinks.revokedAt,
      canComment: shareLinks.canComment,
      reviewStatus: reviews.status,
      reviewArchivedAt: reviews.archivedAt,
      projectId: reviews.projectId,
      environmentId: reviews.environmentId,
      projectStatus: projects.status,
      installationEnabled: projectEnvironments.isEnabled,
      envAllowedOrigins: projectEnvironments.allowedOrigins,
      consentSettings: projectEnvironments.consentSettings,
      guestName: guestIdentities.name,
    })
    .from(reviewSessions)
    .innerJoin(shareLinks, eq(shareLinks.id, reviewSessions.shareLinkId))
    .innerJoin(reviews, eq(reviews.id, reviewSessions.reviewId))
    .innerJoin(projects, eq(projects.id, reviews.projectId))
    .innerJoin(
      projectEnvironments,
      eq(projectEnvironments.id, reviews.environmentId),
    )
    .leftJoin(
      guestIdentities,
      eq(guestIdentities.id, reviewSessions.guestIdentityId),
    )
    .where(eq(reviewSessions.tokenHash, tokenHash))
    .limit(1);

  if (!row || !row.guestIdentityId || !row.guestName || !row.allowedOrigin) {
    return { ok: false, reason: "invalid", status: 401, corsOrigin: header.origin };
  }

  if (row.sessionRevokedAt || row.shareRevokedAt) {
    return { ok: false, reason: "revoked", status: 403, corsOrigin: header.origin };
  }

  if (
    row.sessionExpiresAt <= now ||
    (row.shareExpiresAt !== null && row.shareExpiresAt <= now)
  ) {
    return { ok: false, reason: "expired", status: 403, corsOrigin: header.origin };
  }

  if (row.reviewArchivedAt || row.projectStatus === "archived") {
    return { ok: false, reason: "archived", status: 403, corsOrigin: header.origin };
  }

  if (row.reviewStatus === "closed") {
    return { ok: false, reason: "closed", status: 403, corsOrigin: header.origin };
  }

  if (!row.installationEnabled) {
    return { ok: false, reason: "disabled", status: 403, corsOrigin: header.origin };
  }

  if (
    header.origin !== row.allowedOrigin ||
    !isOriginAllowed(header.origin, row.envAllowedOrigins)
  ) {
    return { ok: false, reason: "origin", status: 403, corsOrigin: header.origin };
  }

  await db
    .update(reviewSessions)
    .set({ lastSeenAt: now })
    .where(eq(reviewSessions.id, row.sessionId));

  return {
    ok: true,
    corsOrigin: header.origin,
    session: {
      sessionId: row.sessionId,
      workspaceId: row.workspaceId,
      projectId: row.projectId,
      environmentId: row.environmentId,
      reviewId: row.reviewId,
      shareLinkId: row.shareLinkId,
      guestIdentityId: row.guestIdentityId,
      guestName: row.guestName,
      canComment: row.canComment,
      allowedOrigin: row.allowedOrigin,
      privateSelectors: row.consentSettings?.privateSelectors ?? [],
      reviewStatus: row.reviewStatus,
    },
  };
}

export function sdkSessionErrorMessage(
  reason: Extract<SdkSessionLookup, { ok: false }>["reason"],
): string {
  switch (reason) {
    case "missing":
    case "invalid":
      return "This review session isn’t available. Open the review link again.";
    case "expired":
      return "This review link has expired. Ask the team for a new link.";
    case "revoked":
      return "This review link was turned off. Ask the team for a new link.";
    case "origin":
      return "Passoff isn’t allowed on this website address.";
    case "closed":
      return "This review is closed, so feedback can’t be added.";
    case "archived":
      return "This review isn’t available anymore.";
    case "disabled":
      return "Passoff is turned off for this website.";
    case "commenting_disabled":
      return "Commenting is turned off for this review link.";
    default:
      return "Passoff couldn’t continue this review. Try opening the review link again.";
  }
}
