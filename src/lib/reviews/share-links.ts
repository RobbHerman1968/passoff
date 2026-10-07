import "server-only";

import { randomBytes } from "node:crypto";

import { and, eq, isNull } from "drizzle-orm";

import { db } from "@/db";
import {
  guestIdentities,
  projectEnvironments,
  projects,
  reviews,
  sdkExchangeCodes,
  shareLinks,
} from "@/db/schema";
import { hashToken } from "@/lib/auth/tokens";
import { canMutateProjects } from "@/lib/projects/permissions";
import type { WorkspaceContext } from "@/lib/workspaces/context";
import { isOriginAllowed, normalizeOrigin } from "@/lib/installations/origin";

export const SHARE_TOKEN_BYTES = 32;
export const EXCHANGE_CODE_BYTES = 24;
export const EXCHANGE_CODE_TTL_MS = 2 * 60 * 1000;

export type ShareLinkSummary = {
  id: string;
  canComment: boolean;
  canApprove: boolean;
  expiresAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
  lastOpenedAt: Date | null;
};

function createRawToken(bytes: number): { raw: string; hash: string } {
  const raw = randomBytes(bytes).toString("base64url");
  return { raw, hash: hashToken(raw) };
}

export function getShareReviewUrl(rawToken: string, siteUrl?: string): string {
  const base = (siteUrl ?? process.env.NEXT_PUBLIC_SITE_URL ?? "").replace(/\/$/, "");
  if (!base) {
    throw new Error("NEXT_PUBLIC_SITE_URL is not configured.");
  }
  return `${base}/r/${encodeURIComponent(rawToken)}`;
}

export async function createShareLink(
  context: WorkspaceContext,
  input: {
    projectId: string;
    reviewId: string;
    canComment?: boolean;
    canApprove?: boolean;
    expiresAt?: Date | null;
  },
): Promise<
  | { ok: true; shareLink: ShareLinkSummary; rawToken: string; url: string }
  | { ok: false; error: "forbidden" | "not_found" | "validation" | "unavailable"; message?: string }
> {
  if (!canMutateProjects(context)) {
    return { ok: false, error: "forbidden" };
  }

  try {
    return await db.transaction(async (tx) => {
      const [review] = await tx
        .select({
          id: reviews.id,
          workspaceId: reviews.workspaceId,
          projectId: reviews.projectId,
          status: reviews.status,
          archivedAt: reviews.archivedAt,
          projectStatus: projects.status,
          environmentId: reviews.environmentId,
          openedAt: reviews.openedAt,
          version: reviews.version,
        })
        .from(reviews)
        .innerJoin(projects, eq(projects.id, reviews.projectId))
        .where(
          and(
            eq(reviews.id, input.reviewId),
            eq(reviews.projectId, input.projectId),
            eq(reviews.workspaceId, context.workspaceId),
            isNull(projects.deletedAt),
          ),
        )
        .limit(1);

      if (!review) {
        return { ok: false as const, error: "not_found" as const };
      }
      if (review.archivedAt || review.projectStatus === "archived") {
        return {
          ok: false as const,
          error: "validation" as const,
          message: "Archived reviews can’t be shared.",
        };
      }
      if (review.status === "closed") {
        return {
          ok: false as const,
          error: "validation" as const,
          message: "Closed reviews can’t be shared.",
        };
      }

      const now = new Date();
      if (review.status === "draft") {
        await tx
          .update(reviews)
          .set({
            status: "open",
            openedAt: review.openedAt ?? now,
            openedByUserId: context.userId,
            version: review.version + 1,
            updatedAt: now,
          })
          .where(
            and(
              eq(reviews.id, review.id),
              eq(reviews.workspaceId, context.workspaceId),
              eq(reviews.version, review.version),
            ),
          );
      }

      const { raw, hash } = createRawToken(SHARE_TOKEN_BYTES);
      const [row] = await tx
        .insert(shareLinks)
        .values({
          workspaceId: context.workspaceId,
          reviewId: review.id,
          tokenHash: hash,
          canComment: input.canComment ?? true,
          canApprove: input.canApprove ?? false,
          createdByUserId: context.userId,
          expiresAt: input.expiresAt ?? null,
          createdAt: now,
          updatedAt: now,
        })
        .returning({
          id: shareLinks.id,
          canComment: shareLinks.canComment,
          canApprove: shareLinks.canApprove,
          expiresAt: shareLinks.expiresAt,
          revokedAt: shareLinks.revokedAt,
          createdAt: shareLinks.createdAt,
          lastOpenedAt: shareLinks.lastOpenedAt,
        });

      return {
        ok: true as const,
        shareLink: row,
        rawToken: raw,
        url: getShareReviewUrl(raw),
      };
    });
  } catch (error) {
    return {
      ok: false,
      error: "unavailable",
      message:
        error instanceof Error && error.message.includes("NEXT_PUBLIC_SITE_URL")
          ? "The site URL isn’t configured, so a guest link can’t be created yet."
          : "We couldn’t create a guest link. Try again.",
    };
  }
}

export async function revokeShareLink(
  context: WorkspaceContext,
  input: { projectId: string; reviewId: string; shareLinkId: string },
): Promise<{ ok: true } | { ok: false; error: "forbidden" | "not_found" | "unavailable" }> {
  if (!canMutateProjects(context)) {
    return { ok: false, error: "forbidden" };
  }

  const now = new Date();
  const [updated] = await db
    .update(shareLinks)
    .set({ revokedAt: now, updatedAt: now })
    .where(
      and(
        eq(shareLinks.id, input.shareLinkId),
        eq(shareLinks.reviewId, input.reviewId),
        eq(shareLinks.workspaceId, context.workspaceId),
        isNull(shareLinks.revokedAt),
      ),
    )
    .returning({ id: shareLinks.id });

  if (!updated) {
    return { ok: false, error: "not_found" };
  }
  return { ok: true };
}

export async function listShareLinksForReview(
  context: WorkspaceContext,
  reviewId: string,
): Promise<ShareLinkSummary[]> {
  return db
    .select({
      id: shareLinks.id,
      canComment: shareLinks.canComment,
      canApprove: shareLinks.canApprove,
      expiresAt: shareLinks.expiresAt,
      revokedAt: shareLinks.revokedAt,
      createdAt: shareLinks.createdAt,
      lastOpenedAt: shareLinks.lastOpenedAt,
    })
    .from(shareLinks)
    .where(
      and(
        eq(shareLinks.reviewId, reviewId),
        eq(shareLinks.workspaceId, context.workspaceId),
      ),
    );
}

export type ResolvedShareLink =
  | {
      ok: true;
      shareLinkId: string;
      workspaceId: string;
      reviewId: string;
      environmentId: string;
      projectId: string;
      canComment: boolean;
      canApprove: boolean;
      reviewStatus: "draft" | "open" | "closed";
      reviewArchivedAt: Date | null;
      projectStatus: "active" | "archived";
      startingUrl: string;
      allowedOrigins: string[];
      installationEnabled: boolean;
      publicKey: string;
      privateSelectors: string[];
    }
  | {
      ok: false;
      reason: "invalid" | "expired" | "revoked" | "closed" | "archived" | "disabled";
    };

export async function resolveShareLinkToken(
  rawToken: string,
): Promise<ResolvedShareLink> {
  const tokenHash = hashToken(rawToken);
  const now = new Date();

  const [row] = await db
    .select({
      shareLinkId: shareLinks.id,
      workspaceId: shareLinks.workspaceId,
      reviewId: shareLinks.reviewId,
      canComment: shareLinks.canComment,
      canApprove: shareLinks.canApprove,
      expiresAt: shareLinks.expiresAt,
      revokedAt: shareLinks.revokedAt,
      reviewStatus: reviews.status,
      reviewArchivedAt: reviews.archivedAt,
      projectId: reviews.projectId,
      environmentId: reviews.environmentId,
      projectStatus: projects.status,
      startingUrl: projectEnvironments.baseUrl,
      allowedOrigins: projectEnvironments.allowedOrigins,
      installationEnabled: projectEnvironments.isEnabled,
      publicKey: projectEnvironments.publicKey,
      consentSettings: projectEnvironments.consentSettings,
    })
    .from(shareLinks)
    .innerJoin(reviews, eq(reviews.id, shareLinks.reviewId))
    .innerJoin(projects, eq(projects.id, reviews.projectId))
    .innerJoin(
      projectEnvironments,
      eq(projectEnvironments.id, reviews.environmentId),
    )
    .where(eq(shareLinks.tokenHash, tokenHash))
    .limit(1);

  if (!row) {
    return { ok: false, reason: "invalid" };
  }
  if (row.revokedAt) {
    return { ok: false, reason: "revoked" };
  }
  if (row.expiresAt && row.expiresAt <= now) {
    return { ok: false, reason: "expired" };
  }
  if (row.reviewArchivedAt || row.projectStatus === "archived") {
    return { ok: false, reason: "archived" };
  }
  if (row.reviewStatus === "closed") {
    return { ok: false, reason: "closed" };
  }
  if (!row.installationEnabled) {
    return { ok: false, reason: "disabled" };
  }

  return {
    ok: true,
    shareLinkId: row.shareLinkId,
    workspaceId: row.workspaceId,
    reviewId: row.reviewId,
    environmentId: row.environmentId,
    projectId: row.projectId,
    canComment: row.canComment,
    canApprove: row.canApprove,
    reviewStatus: row.reviewStatus,
    reviewArchivedAt: row.reviewArchivedAt,
    projectStatus: row.projectStatus,
    startingUrl: row.startingUrl,
    allowedOrigins: row.allowedOrigins,
    installationEnabled: row.installationEnabled,
    publicKey: row.publicKey,
    privateSelectors: row.consentSettings?.privateSelectors ?? [],
  };
}

export async function upsertGuestIdentity(input: {
  workspaceId: string;
  name: string;
  email: string;
}): Promise<{ id: string; name: string; email: string }> {
  const name = input.name.trim().slice(0, 120);
  const email = input.email.trim().toLowerCase().slice(0, 320);
  const now = new Date();

  const [existing] = await db
    .select({
      id: guestIdentities.id,
      name: guestIdentities.name,
      email: guestIdentities.email,
    })
    .from(guestIdentities)
    .where(
      and(
        eq(guestIdentities.workspaceId, input.workspaceId),
        eq(guestIdentities.email, email),
      ),
    )
    .limit(1);

  if (existing) {
    if (existing.name !== name) {
      await db
        .update(guestIdentities)
        .set({ name, updatedAt: now })
        .where(eq(guestIdentities.id, existing.id));
    }
    return { id: existing.id, name, email };
  }

  const [created] = await db
    .insert(guestIdentities)
    .values({
      workspaceId: input.workspaceId,
      name,
      email,
      createdAt: now,
      updatedAt: now,
    })
    .returning({
      id: guestIdentities.id,
      name: guestIdentities.name,
      email: guestIdentities.email,
    });

  return created;
}

export async function createSdkExchangeCode(input: {
  workspaceId: string;
  reviewId: string;
  shareLinkId: string;
  guestIdentityId: string;
  environmentId: string;
  allowedOrigin: string;
}): Promise<{ rawCode: string; expiresAt: Date }> {
  const origin = normalizeOrigin(input.allowedOrigin);
  if (!origin.ok) {
    throw new Error("invalid_origin");
  }

  const { raw, hash } = createRawToken(EXCHANGE_CODE_BYTES);
  const expiresAt = new Date(Date.now() + EXCHANGE_CODE_TTL_MS);
  const now = new Date();

  await db.insert(sdkExchangeCodes).values({
    workspaceId: input.workspaceId,
    reviewId: input.reviewId,
    shareLinkId: input.shareLinkId,
    guestIdentityId: input.guestIdentityId,
    environmentId: input.environmentId,
    codeHash: hash,
    allowedOrigin: origin.origin,
    expiresAt,
    createdAt: now,
  });

  await db
    .update(shareLinks)
    .set({ lastOpenedAt: now, updatedAt: now })
    .where(eq(shareLinks.id, input.shareLinkId));

  return { rawCode: raw, expiresAt };
}

export function buildWebsiteLaunchUrl(startingUrl: string, exchangeCode: string): string {
  const url = new URL(startingUrl);
  // Prefer a fragment so the exchange code is not sent as a normal query string.
  const existing = url.hash.startsWith("#") ? url.hash.slice(1) : url.hash;
  const params = new URLSearchParams(existing);
  params.set("passoff_x", exchangeCode);
  url.hash = params.toString();
  return url.toString();
}

export function assertOriginOnShareLink(
  requestOrigin: string | null | undefined,
  allowedOrigins: string[],
): string | null {
  const normalized = normalizeOrigin(requestOrigin);
  if (!normalized.ok) return null;
  if (!isOriginAllowed(normalized.origin, allowedOrigins)) return null;
  return normalized.origin;
}
