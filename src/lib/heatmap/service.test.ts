import { afterEach, describe, expect, it } from "vitest";

import { db } from "@/db";
import {
  issues,
  projectEnvironments,
  reviews,
  workspaceMemberships,
  workspaces,
} from "@/db/schema";
import { createCredentialsUser } from "@/lib/auth/users";
import { createOwnerWorkspace } from "@/lib/auth/workspace";
import { listHeatmapIssuesForPage } from "@/lib/heatmap/service";
import { createProject, createWebsiteReview } from "@/lib/projects/service";
import {
  createSdkExchangeCode,
  createShareLink,
  upsertGuestIdentity,
} from "@/lib/reviews/share-links";
import { createSdkIssue } from "@/lib/sdk/issues";
import { exchangeSdkSession, resolveSdkSession } from "@/lib/sdk/session";
import { GET as heatmapGet } from "@/app/api/sdk/v1/heatmap/route";
import type { WorkspaceContext } from "@/lib/workspaces/context";
import { and, eq } from "drizzle-orm";
import { clearInstallationRateLimit } from "@/lib/installations/rate-limit";

const uniqueEmail = (label: string) =>
  `${label}.${Date.now()}.${Math.random().toString(16).slice(2)}@example.com`;

async function createWorkspaceContext(label: string): Promise<WorkspaceContext> {
  const created = await createCredentialsUser({
    firstName: "Heat",
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

async function seedReview(label: string, origin = "https://heat.example.com") {
  process.env.NEXT_PUBLIC_SITE_URL =
    process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
  const context = await createWorkspaceContext(label);
  const project = await createProject(context, `${label} Project`);
  if (!project.ok) throw new Error("project failed");
  const review = await createWebsiteReview(context, {
    projectId: project.project.id,
    name: `${label} Review`,
    websiteUrl: `${origin}/start`,
  });
  if (!review.ok) throw new Error("review failed");
  const [installation] = await db
    .select({
      id: projectEnvironments.id,
      publicKey: projectEnvironments.publicKey,
    })
    .from(projectEnvironments)
    .innerJoin(reviews, eq(reviews.environmentId, projectEnvironments.id))
    .where(eq(reviews.id, review.review.id));
  const share = await createShareLink(context, {
    projectId: project.project.id,
    reviewId: review.review.id,
  });
  if (!share.ok) throw new Error("share failed");
  const guest = await upsertGuestIdentity({
    workspaceId: context.workspaceId,
    name: "Guest Reviewer",
    email: uniqueEmail(`${label}-guest`),
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

function bearerRequest(token: string, origin: string, url: string) {
  return new Request(url, {
    headers: {
      Origin: origin,
      Authorization: `Bearer ${token}`,
    },
  });
}

function baseAnchor(origin: string, route = "/start", pageTitle = "Start") {
  return {
    pageUrl: `${origin}${route === "/" ? "" : route}`,
    route,
    pageTitle,
    elementTag: "h1",
    nearbyVisibleText: pageTitle,
    normalizedPosition: { x: 0.4, y: 0.2 },
    documentPosition: { x: 20, y: 40 },
    elementBounds: { x: 0, y: 0, width: 100, height: 40 },
    viewport: { width: 1200, height: 800 },
    devicePixelRatio: 2,
    environment: { browser: "Chrome", operatingSystem: "macOS" },
    hostBuildId: "build-1",
    capturedAt: new Date().toISOString(),
    private: false,
    approvedDataAttributes: { "aria-label": pageTitle },
    cssSelector: "h1.secret-selector",
    ancestryFingerprint: "main>h1",
    accessibleName: pageTitle,
    accessibleRole: "heading",
    stableElementId: "hero",
  };
}

async function sdkSessionFor(seeded: Awaited<ReturnType<typeof seedReview>>) {
  const exchanged = await exchangeSdkSession({
    installationKey: seeded.installation.publicKey,
    exchangeCode: seeded.exchange.rawCode,
    headerOrigin: seeded.origin,
    rateLimitSubjects: [`heat-${seeded.origin}`],
  });
  if (!exchanged.ok) throw new Error("exchange failed");
  const resolved = await resolveSdkSession(
    bearerRequest(
      exchanged.sessionToken,
      seeded.origin,
      "https://app.example.com/api/sdk/v1/heatmap",
    ),
  );
  if (!resolved.ok) throw new Error("resolve failed");
  return { session: resolved.session, token: exchanged.sessionToken };
}

afterEach(async () => {
  await clearInstallationRateLimit("sdk_session_exchange", []);
});

describe("issue heatmap authorization", () => {
  it(
    "filters the current page, defaults to active issues, and hides private fields",
    { timeout: 60_000 },
    async () => {
      const seeded = await seedReview("heat-page", "https://page.heat.example.com");
      const { session, token } = await sdkSessionFor(seeded);
      const pricing = await createSdkIssue(session, {
        body: "Pricing button contrast",
        priority: "high",
        pageUrl: `${seeded.origin}/pricing`,
        anchor: baseAnchor(seeded.origin, "/pricing", "Pricing"),
        screenshot: { status: "unavailable", reason: "skipped" },
        idempotencyKey: `heat_price_${Date.now()}`,
      });
      expect(pricing.ok).toBe(true);
      const about = await createSdkIssue(session, {
        body: "About heading wrap",
        priority: "low",
        pageUrl: `${seeded.origin}/about`,
        anchor: baseAnchor(seeded.origin, "/about", "About"),
        screenshot: { status: "unavailable", reason: "skipped" },
        idempotencyKey: `heat_about_${Date.now()}`,
      });
      expect(about.ok).toBe(true);
      if (!pricing.ok || !about.ok) return;

      await db
        .update(issues)
        .set({ status: "verified", verifiedAt: new Date(), updatedAt: new Date() })
        .where(eq(issues.id, about.issue.id));

      const active = await listHeatmapIssuesForPage(session, `${seeded.origin}/pricing`, {});
      expect(active.ok).toBe(true);
      if (!active.ok) return;
      expect(active.issues.map((item) => item.number)).toEqual([pricing.issue.number]);
      expect(active.issues[0]?.assigneeDisplayName).toBeNull();
      expect(JSON.stringify(active.issues)).not.toContain("secret-selector");
      expect(JSON.stringify(active.issues)).not.toContain("ancestryFingerprint");
      expect(active.issues[0]?.groupLabel).toBe("Pricing");

      const verified = await listHeatmapIssuesForPage(session, `${seeded.origin}/about`, {
        show: "verified",
      });
      expect(verified.ok && verified.issues.map((item) => item.number)).toEqual([
        about.issue.number,
      ]);

      const highOnly = await listHeatmapIssuesForPage(session, `${seeded.origin}/pricing`, {
        priority: "high",
      });
      expect(highOnly.ok && highOnly.issues).toHaveLength(1);
      const lowOnly = await listHeatmapIssuesForPage(session, `${seeded.origin}/pricing`, {
        priority: "low",
      });
      expect(lowOnly.ok && lowOnly.issues).toHaveLength(0);

      const versionMiss = await listHeatmapIssuesForPage(session, `${seeded.origin}/pricing`, {
        version: "other-build",
      });
      expect(versionMiss.ok && versionMiss.issues).toHaveLength(0);

      const otherOrigin = await listHeatmapIssuesForPage(
        session,
        "https://not-allowed.example.com/pricing",
        {},
      );
      expect(otherOrigin).toEqual({ ok: false, error: "origin" });

      const response = await heatmapGet(
        bearerRequest(
          token,
          seeded.origin,
          `https://app.example.com/api/sdk/v1/heatmap?pageUrl=${encodeURIComponent(`${seeded.origin}/pricing`)}`,
        ),
      );
      expect(response.status).toBe(200);
      const body = (await response.json()) as {
        issues: Array<Record<string, unknown>>;
        explanation: string;
      };
      expect(body.explanation).toContain("does not track website visitors");
      expect(JSON.stringify(body.issues)).not.toContain("cssSelector");
    },
  );

  it(
    "isolates reviews and rejects revoked sessions",
    { timeout: 60_000 },
    async () => {
      const workspaceA = await seedReview("heat-a", "https://a.heat.example.com");
      const workspaceB = await seedReview("heat-b", "https://b.heat.example.com");
      const sessionA = await sdkSessionFor(workspaceA);
      const sessionB = await sdkSessionFor(workspaceB);
      await createSdkIssue(sessionA.session, {
        body: "A only",
        pageUrl: `${workspaceA.origin}/start`,
        anchor: baseAnchor(workspaceA.origin),
        screenshot: { status: "unavailable", reason: "skipped" },
        idempotencyKey: `heat_a_${Date.now()}`,
      });
      const listedB = await listHeatmapIssuesForPage(
        sessionB.session,
        `${workspaceB.origin}/start`,
        {},
      );
      expect(listedB.ok && listedB.issues).toEqual([]);

      const revoked = await heatmapGet(
        bearerRequest(
          "not-a-session",
          workspaceA.origin,
          `https://app.example.com/api/sdk/v1/heatmap?pageUrl=${encodeURIComponent(`${workspaceA.origin}/start`)}`,
        ),
      );
      expect(revoked.status).toBeGreaterThanOrEqual(401);
    },
  );
});
