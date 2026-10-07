import { randomBytes, randomUUID } from "node:crypto";

import { and, eq } from "drizzle-orm";
import { afterEach, describe, expect, it, vi } from "vitest";

import { db } from "@/db";
import {
  assets,
  guestIdentities,
  issueEvidence,
  reviewSessions,
  reviews,
  shareLinks,
  videoAssets,
  workspaceMemberships,
  workspaces,
} from "@/db/schema";
import { hashToken } from "@/lib/auth/tokens";
import { createCredentialsUser } from "@/lib/auth/users";
import { createOwnerWorkspace } from "@/lib/auth/workspace";
import { createIssue } from "@/lib/issues/service";
import type { WorkspaceContext } from "@/lib/projects/context";
import { createProject, createWebsiteReview } from "@/lib/projects/service";
import { REVIEW_SESSION_COOKIE } from "@/lib/reviews/guest-session";
import { seedWorkspacePlan } from "@/test/workspace-fixtures";

const REVIEW_SESSION_TTL_MS = 12 * 60 * 60 * 1000;

const mocks = vi.hoisted(() => ({
  requireWorkspaceContext: vi.fn(),
  signMuxPlaybackTokens: vi.fn(),
}));

vi.mock("@/lib/workspaces/context", () => ({
  requireWorkspaceContext: mocks.requireWorkspaceContext,
  canDeleteProjects: () => true,
  canMutateProjects: () => true,
}));

vi.mock("@/lib/video/mux", () => ({
  MuxConfigurationError: class MuxConfigurationError extends Error {
    constructor(message = "Mux Video is not configured.") {
      super(message);
      this.name = "MuxConfigurationError";
    }
  },
  signMuxPlaybackTokens: mocks.signMuxPlaybackTokens,
  MUX_PLAYBACK_TOKEN_TTL: "15m",
}));

const uniqueEmail = (label: string) =>
  `${label}.${Date.now()}.${Math.random().toString(16).slice(2)}@example.com`;

async function createWorkspaceContext(label: string): Promise<WorkspaceContext> {
  const created = await createCredentialsUser({
    firstName: "Play",
    lastName: label,
    email: uniqueEmail(label),
    password: "long-enough-password",
  });
  if (!created.ok) throw new Error("user create failed");

  const workspace = await createOwnerWorkspace({
    userId: created.user.id,
    workspaceName: `${label} Studio`,
  });
  if (!workspace.ok) throw new Error("workspace create failed");

  const [membership] = await db
    .select({
      membershipId: workspaceMemberships.id,
      role: workspaceMemberships.role,
      workspaceSlug: workspaces.slug,
    })
    .from(workspaceMemberships)
    .innerJoin(workspaces, eq(workspaces.id, workspaceMemberships.workspaceId))
    .where(
      and(
        eq(workspaceMemberships.userId, created.user.id),
        eq(workspaceMemberships.workspaceId, workspace.workspaceId),
        eq(workspaceMemberships.status, "active"),
      ),
    )
    .limit(1);

  return {
    membershipId: membership.membershipId,
    workspaceId: workspace.workspaceId,
    workspaceName: workspace.workspaceName,
    workspaceSlug: membership.workspaceSlug,
    role: membership.role,
    userId: created.user.id,
    userName: created.user.name ?? null,
    userEmail: created.user.email,
  };
}

async function seedReadyVideo(context: WorkspaceContext) {
  await seedWorkspacePlan(context.workspaceId, "agency");
  const project = await createProject(context, "Playback Project");
  if (!project.ok) throw new Error("project create failed");
  const review = await createWebsiteReview(context, {
    projectId: project.project.id,
    name: "Playback review",
    websiteUrl: "https://example.com/play",
  });
  if (!review.ok) throw new Error("review create failed");
  const issue = await createIssue(context, {
    reviewId: review.review.id,
    body: "Needs video",
  });
  if (!issue.ok) throw new Error("issue create failed");

  const originalAssetId = randomUUID();
  const evidenceId = randomUUID();
  const videoAssetId = randomUUID();
  const playbackId = `playback_${randomUUID()}`;

  await db.insert(assets).values({
    id: originalAssetId,
    workspaceId: context.workspaceId,
    reviewId: review.review.id,
    kind: "video_original",
    status: "ready",
    storageProvider: "mux",
    storageKey: `upload_${randomUUID()}`,
    durationMs: 40_000,
    uploadedByUserId: context.userId,
  });
  await db.insert(issueEvidence).values({
    id: evidenceId,
    workspaceId: context.workspaceId,
    issueId: issue.issue.id,
    assetId: originalAssetId,
    kind: "video",
    captureMethod: "manual_attachment",
    captureStatus: "ready",
    createdByUserId: context.userId,
  });
  await db.insert(videoAssets).values({
    id: videoAssetId,
    workspaceId: context.workspaceId,
    evidenceId,
    originalAssetId,
    durationMs: 40_000,
    processingStatus: "ready",
    providerUploadId: `upload_${randomUUID()}`,
    providerAssetId: `asset_${randomUUID()}`,
    providerPlaybackId: playbackId,
  });

  return { reviewId: review.review.id, videoAssetId, playbackId, evidenceId };
}

async function createGuestSession(input: {
  workspaceId: string;
  reviewId: string;
  createdByUserId: string;
  revokedAt?: Date | null;
  expiresAt?: Date;
  shareRevokedAt?: Date | null;
}) {
  const rawToken = randomBytes(32).toString("base64url");
  const now = new Date();
  const [guest] = await db
    .insert(guestIdentities)
    .values({
      workspaceId: input.workspaceId,
      name: "Guest Reviewer",
      email: uniqueEmail("guest"),
    })
    .returning({ id: guestIdentities.id });

  const [share] = await db
    .insert(shareLinks)
    .values({
      workspaceId: input.workspaceId,
      reviewId: input.reviewId,
      tokenHash: hashToken(randomBytes(32).toString("base64url")),
      createdByUserId: input.createdByUserId,
      revokedAt: input.shareRevokedAt ?? null,
    })
    .returning({ id: shareLinks.id });

  await db.insert(reviewSessions).values({
    workspaceId: input.workspaceId,
    reviewId: input.reviewId,
    shareLinkId: share.id,
    guestIdentityId: guest.id,
    tokenHash: hashToken(rawToken),
    expiresAt: input.expiresAt ?? new Date(Date.now() + REVIEW_SESSION_TTL_MS),
    revokedAt: input.revokedAt ?? null,
    createdAt: now,
    lastSeenAt: now,
  });

  return rawToken;
}

describe("video playback authorization", { timeout: 90_000 }, () => {
  afterEach(() => {
    mocks.requireWorkspaceContext.mockReset();
    mocks.signMuxPlaybackTokens.mockReset();
  });

  it("issues short-lived tokens for workspace members and omits secrets", async () => {
    const context = await createWorkspaceContext("member");
    const seeded = await seedReadyVideo(context);
    mocks.requireWorkspaceContext.mockResolvedValue({ ok: true, context });
    mocks.signMuxPlaybackTokens.mockResolvedValue({
      playback: "playback-jwt",
      thumbnail: "thumbnail-jwt",
      storyboard: "storyboard-jwt",
    });

    const { authorizeVideoPlayback } = await import("@/lib/video/playback-service");
    const result = await authorizeVideoPlayback(
      new Request("http://localhost/api/video/x/playback"),
      seeded.videoAssetId,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.playbackId).toBe(seeded.playbackId);
    expect(result.tokens).toEqual({
      playback: "playback-jwt",
      thumbnail: "thumbnail-jwt",
      storyboard: "storyboard-jwt",
    });
    expect(result.expiresInSeconds).toBe(15 * 60);
    expect(JSON.stringify(result)).not.toMatch(/MUX_|token-secret|private|stream\.mux\.com/i);
  });

  it("denies cross-workspace member access with not found", async () => {
    const owner = await createWorkspaceContext("owner-a");
    const other = await createWorkspaceContext("owner-b");
    const seeded = await seedReadyVideo(owner);
    mocks.requireWorkspaceContext.mockResolvedValue({ ok: true, context: other });

    const { authorizeVideoPlayback } = await import("@/lib/video/playback-service");
    const result = await authorizeVideoPlayback(
      new Request("http://localhost/api/video/x/playback"),
      seeded.videoAssetId,
    );
    expect(result).toMatchObject({ ok: false, status: 404, code: "not_found" });
  });

  it("allows authorized guests and denies revoked or expired sessions", async () => {
    const context = await createWorkspaceContext("guest-host");
    const seeded = await seedReadyVideo(context);
    mocks.requireWorkspaceContext.mockResolvedValue({ ok: false, reason: "unauthenticated" });
    mocks.signMuxPlaybackTokens.mockResolvedValue({
      playback: "playback-jwt",
      thumbnail: "thumbnail-jwt",
      storyboard: "storyboard-jwt",
    });

    const { authorizeVideoPlayback } = await import("@/lib/video/playback-service");

    const activeToken = await createGuestSession({
      workspaceId: context.workspaceId,
      reviewId: seeded.reviewId,
      createdByUserId: context.userId,
    });
    const allowed = await authorizeVideoPlayback(
      new Request("http://localhost/api/video/x/playback", {
        headers: { cookie: `${REVIEW_SESSION_COOKIE}=${activeToken}` },
      }),
      seeded.videoAssetId,
    );
    expect(allowed.ok).toBe(true);

    const revokedToken = await createGuestSession({
      workspaceId: context.workspaceId,
      reviewId: seeded.reviewId,
      createdByUserId: context.userId,
      shareRevokedAt: new Date(),
    });
    const revoked = await authorizeVideoPlayback(
      new Request("http://localhost/api/video/x/playback", {
        headers: { cookie: `${REVIEW_SESSION_COOKIE}=${revokedToken}` },
      }),
      seeded.videoAssetId,
    );
    expect(revoked).toMatchObject({ ok: false, status: 403, code: "permission_denied" });

    const expiredToken = await createGuestSession({
      workspaceId: context.workspaceId,
      reviewId: seeded.reviewId,
      createdByUserId: context.userId,
      expiresAt: new Date(Date.now() - 60_000),
    });
    const expired = await authorizeVideoPlayback(
      new Request("http://localhost/api/video/x/playback", {
        headers: { cookie: `${REVIEW_SESSION_COOKIE}=${expiredToken}` },
      }),
      seeded.videoAssetId,
    );
    expect(expired).toMatchObject({ ok: false, status: 403, code: "permission_denied" });
  });

  it("denies non-ready videos", async () => {
    const context = await createWorkspaceContext("processing");
    const seeded = await seedReadyVideo(context);
    await db
      .update(videoAssets)
      .set({ processingStatus: "processing", providerPlaybackId: null })
      .where(eq(videoAssets.id, seeded.videoAssetId));
    await db
      .update(issueEvidence)
      .set({ captureStatus: "pending" })
      .where(eq(issueEvidence.id, seeded.evidenceId));

    mocks.requireWorkspaceContext.mockResolvedValue({ ok: true, context });
    const { authorizeVideoPlayback } = await import("@/lib/video/playback-service");
    const result = await authorizeVideoPlayback(
      new Request("http://localhost/api/video/x/playback"),
      seeded.videoAssetId,
    );
    expect(result).toMatchObject({ ok: false, status: 409, code: "processing" });
  });

  it("never plays removed, replaced, or not-yet-promoted clips", async () => {
    const context = await createWorkspaceContext("lifecycle");
    mocks.requireWorkspaceContext.mockResolvedValue({ ok: true, context });
    mocks.signMuxPlaybackTokens.mockResolvedValue({
      playback: "playback-jwt",
      thumbnail: "thumbnail-jwt",
      storyboard: "storyboard-jwt",
    });
    const { authorizeVideoPlayback } = await import("@/lib/video/playback-service");

    for (const lifecycle of ["removed", "retired", "replacement"] as const) {
      const seeded = await seedReadyVideo(context);
      await db
        .update(videoAssets)
        .set({ lifecycle })
        .where(eq(videoAssets.id, seeded.videoAssetId));
      const result = await authorizeVideoPlayback(
        new Request("http://localhost/api/video/x/playback"),
        seeded.videoAssetId,
      );
      expect(result, lifecycle).toMatchObject({ ok: false, status: 404, code: "not_found" });
    }
    expect(mocks.signMuxPlaybackTokens).not.toHaveBeenCalled();
  });

  it("stops guest playback when the review is archived or the clip is removed", async () => {
    const context = await createWorkspaceContext("guest-archived");
    const seeded = await seedReadyVideo(context);
    mocks.requireWorkspaceContext.mockResolvedValue({ ok: false, reason: "unauthenticated" });
    mocks.signMuxPlaybackTokens.mockResolvedValue({
      playback: "p",
      thumbnail: "t",
      storyboard: "s",
    });
    const { authorizeVideoPlayback } = await import("@/lib/video/playback-service");

    const token = await createGuestSession({
      workspaceId: context.workspaceId,
      reviewId: seeded.reviewId,
      createdByUserId: context.userId,
    });
    const request = () =>
      new Request("http://localhost/api/video/x/playback", {
        headers: { cookie: `${REVIEW_SESSION_COOKIE}=${token}` },
      });
    expect((await authorizeVideoPlayback(request(), seeded.videoAssetId)).ok).toBe(true);

    await db
      .update(reviews)
      .set({ archivedAt: new Date() })
      .where(eq(reviews.id, seeded.reviewId));
    expect(await authorizeVideoPlayback(request(), seeded.videoAssetId)).toMatchObject({
      ok: false,
      status: 404,
    });

    await db.update(reviews).set({ archivedAt: null }).where(eq(reviews.id, seeded.reviewId));
    expect((await authorizeVideoPlayback(request(), seeded.videoAssetId)).ok).toBe(true);

    await db
      .update(videoAssets)
      .set({ lifecycle: "removed" })
      .where(eq(videoAssets.id, seeded.videoAssetId));
    expect(await authorizeVideoPlayback(request(), seeded.videoAssetId)).toMatchObject({
      ok: false,
      status: 404,
    });
  });

  it("playback route returns only playback id and tokens", async () => {
    const context = await createWorkspaceContext("route");
    const seeded = await seedReadyVideo(context);
    mocks.requireWorkspaceContext.mockResolvedValue({ ok: true, context });
    mocks.signMuxPlaybackTokens.mockResolvedValue({
      playback: "playback-jwt",
      thumbnail: "thumbnail-jwt",
      storyboard: "storyboard-jwt",
    });

    const { GET } = await import("@/app/api/video/[videoAssetId]/playback/route");
    const response = await GET(new Request("http://localhost/api/video/x/playback"), {
      params: Promise.resolve({ videoAssetId: seeded.videoAssetId }),
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    const body = await response.json();
    expect(body).toEqual({
      ok: true,
      playbackId: seeded.playbackId,
      tokens: {
        playback: "playback-jwt",
        thumbnail: "thumbnail-jwt",
        storyboard: "storyboard-jwt",
      },
      expiresInSeconds: 900,
    });
    expect(JSON.stringify(body)).not.toMatch(/MUX_|stream\.mux\.com|private_key|webhook/i);
  });
});
