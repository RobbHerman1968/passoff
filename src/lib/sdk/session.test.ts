import { and, eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";

import { db } from "@/db";
import {
  guestIdentities,
  issueAnchors,
  issueIdempotencyKeys,
  issues,
  projectEnvironments,
  reviewSessions,
  reviews,
  sdkExchangeCodes,
  shareLinks,
  workspaceMemberships,
  workspaces,
} from "@/db/schema";
import { createCredentialsUser } from "@/lib/auth/users";
import { createOwnerWorkspace } from "@/lib/auth/workspace";
import { clearInstallationRateLimit } from "@/lib/installations/rate-limit";
import { createProject, createWebsiteReview } from "@/lib/projects/service";
import type { WorkspaceContext } from "@/lib/workspaces/context";
import {
  createSdkExchangeCode,
  createShareLink,
  upsertGuestIdentity,
} from "@/lib/reviews/share-links";
import { createSdkIssue, listSdkIssuesForPage } from "@/lib/sdk/issues";
import { exchangeSdkSession, resolveSdkSession } from "@/lib/sdk/session";
import { hashToken } from "@/lib/auth/tokens";

const uniqueEmail = (label: string) =>
  `${label}.${Date.now()}.${Math.random().toString(16).slice(2)}@example.com`;

async function createWorkspaceContext(label: string): Promise<WorkspaceContext> {
  const created = await createCredentialsUser({
    firstName: "Sdk",
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

async function seedReview(origin = "https://example.com") {
  process.env.NEXT_PUBLIC_SITE_URL =
    process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

  const context = await createWorkspaceContext("sdk");
  const project = await createProject(context, "SDK Project");
  if (!project.ok) throw new Error("project failed");

  const review = await createWebsiteReview(context, {
    projectId: project.project.id,
    name: "Homepage",
    websiteUrl: `${origin}/start`,
  });
  if (!review.ok) throw new Error("review failed");

  const [installation] = await db
    .select({
      id: projectEnvironments.id,
      publicKey: projectEnvironments.publicKey,
      allowedOrigins: projectEnvironments.allowedOrigins,
    })
    .from(projectEnvironments)
    .innerJoin(reviews, eq(reviews.environmentId, projectEnvironments.id))
    .where(eq(reviews.id, review.review.id));

  const share = await createShareLink(context, {
    projectId: project.project.id,
    reviewId: review.review.id,
  });
  if (!share.ok) {
    throw new Error(`share failed: ${share.error} ${share.message ?? ""}`);
  }

  const guest = await upsertGuestIdentity({
    workspaceId: context.workspaceId,
    name: "Guest Reviewer",
    email: uniqueEmail("guest"),
  });

  const exchange = await createSdkExchangeCode({
    workspaceId: context.workspaceId,
    reviewId: review.review.id,
    shareLinkId: share.shareLink.id,
    guestIdentityId: guest.id,
    environmentId: installation.id,
    allowedOrigin: origin,
  });

  return {
    context,
    projectId: project.project.id,
    reviewId: review.review.id,
    installation,
    share,
    guest,
    exchange,
    origin,
  };
}

function bearerRequest(
  token: string,
  origin: string,
  init?: RequestInit,
): Request {
  return new Request("https://app.example.com/api/sdk/v1/issues", {
    ...init,
    headers: {
      Origin: origin,
      Authorization: `Bearer ${token}`,
      ...(init?.headers ?? {}),
    },
  });
}

describe("SDK secure session and issues", () => {
  const cleanupKeys: Array<{ key: string; origin: string }> = [];

  afterEach(async () => {
    for (const item of cleanupKeys) {
      await clearInstallationRateLimit("sdk_session_exchange", [
        item.key,
        item.origin,
        "fp",
      ]);
      await clearInstallationRateLimit("sdk_issue_write", [
        "session",
        "review",
        "fp",
      ]);
    }
    cleanupKeys.length = 0;
  });

  it("rejects issue reads and writes when only the public installation key is present", async () => {
    const seeded = await seedReview();
    cleanupKeys.push({
      key: seeded.installation.publicKey,
      origin: seeded.origin,
    });

    const bare = new Request(
      `https://app.example.com/api/sdk/v1/issues?pageUrl=${encodeURIComponent(`${seeded.origin}/start`)}`,
      {
        headers: {
          Origin: seeded.origin,
          "X-Passoff-Key": seeded.installation.publicKey,
        },
      },
    );
    const resolved = await resolveSdkSession(bare);
    expect(resolved.ok).toBe(false);
    if (!resolved.ok) {
      expect(resolved.reason).toBe("missing");
    }
  });

  it("enforces exact allowed origins and rejects disallowed origins", async () => {
    const seeded = await seedReview("https://example.com");
    cleanupKeys.push({
      key: seeded.installation.publicKey,
      origin: seeded.origin,
    });

    const allowed = await exchangeSdkSession({
      installationKey: seeded.installation.publicKey,
      exchangeCode: seeded.exchange.rawCode,
      headerOrigin: "https://example.com",
      rateLimitSubjects: ["fp"],
    });
    expect(allowed.ok).toBe(true);

    const second = await createSdkExchangeCode({
      workspaceId: seeded.context.workspaceId,
      reviewId: seeded.reviewId,
      shareLinkId: seeded.share.shareLink.id,
      guestIdentityId: seeded.guest.id,
      environmentId: seeded.installation.id,
      allowedOrigin: "https://example.com",
    });

    const rejected = await exchangeSdkSession({
      installationKey: seeded.installation.publicKey,
      exchangeCode: second.rawCode,
      headerOrigin: "https://www.example.com",
      rateLimitSubjects: ["fp"],
    });
    expect(rejected.ok).toBe(false);
    if (!rejected.ok) {
      expect(rejected.code).toBe("origin");
    }
  });

  it("exchanges a valid code and rejects expired or revoked access", async () => {
    const seeded = await seedReview();
    cleanupKeys.push({
      key: seeded.installation.publicKey,
      origin: seeded.origin,
    });

    const exchanged = await exchangeSdkSession({
      installationKey: seeded.installation.publicKey,
      exchangeCode: seeded.exchange.rawCode,
      headerOrigin: seeded.origin,
      rateLimitSubjects: ["fp"],
    });
    expect(exchanged.ok).toBe(true);
    if (!exchanged.ok) return;

    const replay = await exchangeSdkSession({
      installationKey: seeded.installation.publicKey,
      exchangeCode: seeded.exchange.rawCode,
      headerOrigin: seeded.origin,
      rateLimitSubjects: ["fp"],
    });
    expect(replay.ok).toBe(false);

    const session = await resolveSdkSession(
      bearerRequest(exchanged.sessionToken, seeded.origin),
    );
    expect(session.ok).toBe(true);

    await db
      .update(shareLinks)
      .set({ revokedAt: new Date() })
      .where(eq(shareLinks.id, seeded.share.shareLink.id));

    const revoked = await resolveSdkSession(
      bearerRequest(exchanged.sessionToken, seeded.origin),
    );
    expect(revoked.ok).toBe(false);
    if (!revoked.ok) {
      expect(revoked.reason).toBe("revoked");
    }
  });

  it("rejects commenting when the share link disables comments", async () => {
    const seeded = await seedReview();
    cleanupKeys.push({
      key: seeded.installation.publicKey,
      origin: seeded.origin,
    });

    await db
      .update(shareLinks)
      .set({ canComment: false })
      .where(eq(shareLinks.id, seeded.share.shareLink.id));

    const exchanged = await exchangeSdkSession({
      installationKey: seeded.installation.publicKey,
      exchangeCode: seeded.exchange.rawCode,
      headerOrigin: seeded.origin,
      rateLimitSubjects: ["fp"],
    });
    expect(exchanged.ok).toBe(true);
    if (!exchanged.ok) return;

    const resolved = await resolveSdkSession(
      bearerRequest(exchanged.sessionToken, seeded.origin),
    );
    expect(resolved.ok).toBe(true);
    if (!resolved.ok) return;

    const created = await createSdkIssue(resolved.session, {
      body: "Should fail",
      pageUrl: `${seeded.origin}/start`,
      anchor: {
        pageUrl: `${seeded.origin}/start`,
        route: "/start",
        pageTitle: "Start",
        elementTag: "button",
        nearbyVisibleText: "Click",
        normalizedPosition: { x: 0.5, y: 0.5 },
        documentPosition: { x: 10, y: 10 },
        elementBounds: { x: 0, y: 0, width: 40, height: 40 },
        viewport: { width: 1200, height: 800 },
        devicePixelRatio: 1,
        environment: { browser: "Chrome", operatingSystem: "macOS" },
        hostBuildId: null,
        capturedAt: new Date().toISOString(),
        private: false,
        approvedDataAttributes: {},
        cssSelector: "button",
        ancestryFingerprint: "button",
        accessibleName: "Click",
        accessibleRole: "button",
        stableElementId: null,
      },
      idempotencyKey: "sdk_comment_disabled_1",
    });
    expect(created.ok).toBe(false);
    if (!created.ok) {
      expect(created.error).toBe("commenting_disabled");
    }
  });

  it(
    "isolates issues across reviews and supports idempotent retries",
    { timeout: 30_000 },
    async () => {
    const seededA = await seedReview("https://a.example.com");
    const seededB = await seedReview("https://b.example.com");
    cleanupKeys.push(
      { key: seededA.installation.publicKey, origin: seededA.origin },
      { key: seededB.installation.publicKey, origin: seededB.origin },
    );

    const exchangeA = await exchangeSdkSession({
      installationKey: seededA.installation.publicKey,
      exchangeCode: seededA.exchange.rawCode,
      headerOrigin: seededA.origin,
      rateLimitSubjects: ["fp"],
    });
    expect(exchangeA.ok).toBe(true);
    if (!exchangeA.ok) return;

    const sessionA = await resolveSdkSession(
      bearerRequest(exchangeA.sessionToken, seededA.origin),
    );
    expect(sessionA.ok).toBe(true);
    if (!sessionA.ok) return;

    const anchor = {
      pageUrl: `${seededA.origin}/start`,
      route: "/start",
      pageTitle: "Start",
      elementTag: "h1",
      nearbyVisibleText: "Hello",
      normalizedPosition: { x: 0.4, y: 0.2 },
      documentPosition: { x: 20, y: 40 },
      elementBounds: { x: 0, y: 0, width: 100, height: 40 },
      viewport: { width: 1200, height: 800 },
      devicePixelRatio: 2,
      environment: { browser: "Chrome", operatingSystem: "macOS" },
      hostBuildId: "build-1",
      capturedAt: new Date().toISOString(),
      private: false,
      approvedDataAttributes: { "data-testid": "hero" },
      cssSelector: "h1#hero",
      ancestryFingerprint: "main>h1",
      accessibleName: "Hello",
      accessibleRole: "heading",
      stableElementId: "hero",
    };

    const idempotencyKey = `sdk_idem_${Date.now()}_${Math.random().toString(16).slice(2)}`;

    const first = await createSdkIssue(sessionA.session, {
      body: "Button spacing feels tight",
      pageUrl: anchor.pageUrl,
      anchor,
      screenshot: {
        status: "unavailable",
        reason: "Passoff couldn't capture a picture of this page.",
      },
      idempotencyKey,
    });
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    const retry = await createSdkIssue(sessionA.session, {
      body: "Button spacing feels tight",
      pageUrl: anchor.pageUrl,
      anchor,
      idempotencyKey,
    });
    expect(retry.ok).toBe(true);
    if (!retry.ok) return;
    expect(retry.replayed).toBe(true);
    expect(retry.issue.id).toBe(first.issue.id);

    const listedA = await listSdkIssuesForPage(sessionA.session, anchor.pageUrl);
    expect(listedA.ok).toBe(true);
    if (listedA.ok) {
      expect(listedA.issues).toHaveLength(1);
      expect(listedA.issues[0]?.number).toBe(1);
    }

    const exchangeB = await exchangeSdkSession({
      installationKey: seededB.installation.publicKey,
      exchangeCode: seededB.exchange.rawCode,
      headerOrigin: seededB.origin,
      rateLimitSubjects: ["fp"],
    });
    expect(exchangeB.ok).toBe(true);
    if (!exchangeB.ok) return;
    const sessionB = await resolveSdkSession(
      bearerRequest(exchangeB.sessionToken, seededB.origin),
    );
    expect(sessionB.ok).toBe(true);
    if (!sessionB.ok) return;

    const listedB = await listSdkIssuesForPage(
      sessionB.session,
      `${seededB.origin}/start`,
    );
    expect(listedB.ok).toBe(true);
    if (listedB.ok) {
      expect(listedB.issues).toHaveLength(0);
    }

    const [stored] = await db
      .select({ pageUrl: issueAnchors.pageUrl })
      .from(issueAnchors)
      .innerJoin(issues, eq(issues.id, issueAnchors.issueId))
      .where(eq(issues.id, first.issue.id));
    expect(stored.pageUrl).toBe(anchor.pageUrl);

    const [idem] = await db
      .select()
      .from(issueIdempotencyKeys)
      .where(
        and(
          eq(issueIdempotencyKeys.idempotencyKey, idempotencyKey),
          eq(issueIdempotencyKeys.reviewId, seededA.reviewId),
        ),
      );
    expect(idem?.issueId).toBe(first.issue.id);

    // Session token hashes only — never raw tokens.
    const [sessionRow] = await db
      .select({ tokenHash: reviewSessions.tokenHash })
      .from(reviewSessions)
      .where(eq(reviewSessions.tokenHash, hashToken(exchangeA.sessionToken)));
    expect(sessionRow.tokenHash).toHaveLength(64);

    const [codeRow] = await db
      .select({ consumedAt: sdkExchangeCodes.consumedAt })
      .from(sdkExchangeCodes)
      .where(eq(sdkExchangeCodes.codeHash, hashToken(seededA.exchange.rawCode)));
    expect(codeRow.consumedAt).toBeTruthy();

    const [guest] = await db
      .select({ email: guestIdentities.email })
      .from(guestIdentities)
      .where(eq(guestIdentities.id, seededA.guest.id));
    expect(guest.email).not.toContain(" ");
    },
  );
});
