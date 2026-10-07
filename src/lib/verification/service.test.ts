import { and, eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";

import { db } from "@/db";
import {
  issues,
  projectEnvironments,
  reviews,
  verificationRuns,
  workspaceMemberships,
  workspaces,
} from "@/db/schema";
import { createCredentialsUser } from "@/lib/auth/users";
import { createOwnerWorkspace } from "@/lib/auth/workspace";
import { clearInstallationRateLimit } from "@/lib/installations/rate-limit";
import { createProject, createWebsiteReview } from "@/lib/projects/service";
import { createSdkIssue } from "@/lib/sdk/issues";
import {
  createSdkExchangeCode,
  createShareLink,
  upsertGuestIdentity,
} from "@/lib/reviews/share-links";
import { exchangeSdkSession, resolveSdkSession } from "@/lib/sdk/session";
import {
  exchangeVerificationSession,
  resolveVerificationSession,
} from "@/lib/verification/session";
import { startVerificationRun, submitVerificationResults } from "@/lib/verification/service";
import type { WorkspaceContext } from "@/lib/workspaces/context";

const uniqueEmail = (label: string) =>
  `${label}.${Date.now()}.${Math.random().toString(16).slice(2)}@example.com`;

async function ownerContext(label: string): Promise<WorkspaceContext> {
  const created = await createCredentialsUser({
    firstName: "Verify",
    lastName: label,
    email: uniqueEmail(label),
    password: "long-enough-password",
  });
  if (!created.ok) throw new Error("user create failed");
  const workspace = await createOwnerWorkspace({
    userId: created.user.id,
    workspaceName: `${label} Studio`,
  });
  if (!workspace.ok) throw new Error("workspace failed");
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

async function seedIssue() {
  process.env.NEXT_PUBLIC_SITE_URL =
    process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
  const origin = `https://shop-${Date.now()}.${Math.random().toString(16).slice(2)}.example.com`;
  const context = await ownerContext("vrun");
  const project = await createProject(context, "Shop");
  if (!project.ok) throw new Error("project");
  const review = await createWebsiteReview(context, {
    projectId: project.project.id,
    name: "Checkout",
    websiteUrl: `${origin}/cart`,
  });
  if (!review.ok) throw new Error(`review ${review.error} ${review.message ?? ""}`);

  const [installation] = await db
    .select({
      id: projectEnvironments.id,
      publicKey: projectEnvironments.publicKey,
      allowedOrigins: projectEnvironments.allowedOrigins,
    })
    .from(projectEnvironments)
    .innerJoin(reviews, eq(reviews.environmentId, projectEnvironments.id))
    .where(eq(reviews.id, review.review.id));

  if (!installation) throw new Error("env");
  const env = installation;

  await db
    .update(projectEnvironments)
    .set({ verifiedAt: new Date(), lastSeenAt: new Date() })
    .where(eq(projectEnvironments.id, env.id));

  const share = await createShareLink(context, {
    projectId: project.project.id,
    reviewId: review.review.id,
  });
  if (!share.ok) throw new Error("share");
  const guest = await upsertGuestIdentity({
    workspaceId: context.workspaceId,
    name: "Guest",
    email: uniqueEmail("vguest"),
  });
  const exchange = await createSdkExchangeCode({
    workspaceId: context.workspaceId,
    reviewId: review.review.id,
    shareLinkId: share.shareLink.id,
    guestIdentityId: guest.id,
    environmentId: env.id,
    allowedOrigin: origin,
  });
  const exchanged = await exchangeSdkSession({
    installationKey: env.publicKey,
    exchangeCode: exchange.rawCode,
    headerOrigin: origin,
    rateLimitSubjects: [`v-${context.userId}`],
  });
  if (!exchanged.ok) throw new Error("sdk session");
  const resolved = await resolveSdkSession(
    new Request("https://app.example.com/api/sdk/v1/issues", {
      headers: {
        Origin: origin,
        Authorization: `Bearer ${exchanged.sessionToken}`,
      },
    }),
  );
  if (!resolved.ok) throw new Error("resolve sdk");
  const sdkIssue = await createSdkIssue(resolved.session, {
    body: "Checkout button is missing.",
    pageUrl: `${origin}/cart`,
    idempotencyKey: `idemp-${crypto.randomUUID()}`,
    anchor: {
      pageUrl: `${origin}/cart`,
      route: "/cart",
      pageTitle: "Cart",
      elementTag: "button",
      nearbyVisibleText: "Pay",
      normalizedPosition: { x: 0.5, y: 0.5 },
      documentPosition: { x: 10, y: 10 },
      elementBounds: { x: 0, y: 0, width: 80, height: 32 },
      viewport: { width: 1440, height: 900 },
      devicePixelRatio: 1,
      environment: { browser: "Chrome", operatingSystem: "macOS" },
      hostBuildId: "initial",
      capturedAt: new Date().toISOString(),
      private: false,
      approvedDataAttributes: { "data-testid": "pay" },
      cssSelector: "button",
      ancestryFingerprint: "main>button",
      accessibleName: "Pay",
      accessibleRole: "button",
      stableElementId: "pay",
    },
  });
  if (!sdkIssue.ok) throw new Error("sdk issue");

  await db
    .update(issues)
    .set({ status: "ready_for_verification" })
    .where(eq(issues.id, sdkIssue.issue.id));

  const [issue] = await db
    .select()
    .from(issues)
    .where(
      and(eq(issues.id, sdkIssue.issue.id), eq(issues.workspaceId, context.workspaceId)),
    );

  return { context, origin, installation: env, review, project, issue, guest, share };
}

describe("automated verification runs", { timeout: 30_000 }, () => {
  afterEach(async () => {
    await clearInstallationRateLimit("verification_exchange_create", ["x"]);
  });

  it("starts a one-time scoped session, stores results, and never verifies the issue", async () => {
    const seeded = await seedIssue();
    const started = await startVerificationRun(seeded.context, {
      projectId: seeded.project.project.id,
      reviewId: seeded.review.review.id,
      issueNumber: seeded.issue.number,
      checks: ["element_visibility"],
    });
    expect(started.ok).toBe(true);
    if (!started.ok) return;
    expect(started.launchUrl).toContain("passoff_vx=");

    const code = new URL(started.launchUrl).hash.replace(/^#/, "");
    const params = new URLSearchParams(code);
    const raw = params.get("passoff_vx");
    expect(raw).toBeTruthy();

    const exchanged = await exchangeVerificationSession({
      installationKey: seeded.installation.publicKey,
      exchangeCode: raw!,
      headerOrigin: seeded.origin,
      rateLimitSubjects: [seeded.context.userId],
    });
    expect(exchanged.ok).toBe(true);
    if (!exchanged.ok) return;

    const replay = await exchangeVerificationSession({
      installationKey: seeded.installation.publicKey,
      exchangeCode: raw!,
      headerOrigin: seeded.origin,
      rateLimitSubjects: [`replay-${seeded.context.userId}`],
    });
    expect(replay.ok).toBe(false);

    const wrongOrigin = await resolveVerificationSession(
      new Request("https://app.example.com/api/sdk/v1/verification/results", {
        headers: {
          Origin: "https://evil.example",
          Authorization: `Bearer ${exchanged.sessionToken}`,
        },
      }),
    );
    expect(wrongOrigin.ok).toBe(false);

    const payload = {
      checks: [
        {
          kind: "element_visibility",
          outcome: "passed",
          summary: "The expected element is on the page and visible.",
          measurements: { connected: true, width: 80, height: 32 },
        },
      ],
      actualUrl: `${seeded.origin}/cart?token=secret`,
      actualRoute: "/cart",
      viewport: { width: 1440, height: 900, group: "desktop" },
      version: { method: "application_release", value: "initial" },
      runnerVersion: "1.2.0",
      documentReady: true,
      layoutStable: true,
    };

    const [first, second] = await Promise.all([
      submitVerificationResults({
        session: exchanged.session,
        corsOrigin: seeded.origin,
        idempotencyKey: "run-1",
        payload,
      }),
      submitVerificationResults({
        session: exchanged.session,
        corsOrigin: seeded.origin,
        idempotencyKey: "run-2",
        payload,
      }),
    ]);
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(first.overall).toBe("passed");
    expect(second.overall).toBe("passed");
    expect([first.duplicate, second.duplicate].filter(Boolean)).toHaveLength(1);

    const [issue] = await db
      .select({ status: issues.status })
      .from(issues)
      .where(eq(issues.id, seeded.issue.id));
    expect(issue.status).toBe("ready_for_verification");

    const [run] = await db
      .select()
      .from(verificationRuns)
      .where(eq(verificationRuns.id, exchanged.session.runId));
    expect(run.actualUrl).not.toContain("token=");
    expect(run.deploymentId).toBe(exchanged.session.deploymentId);
    expect(run.overallResult).toBe("passed");

    const outsider = await ownerContext("outsider");
    const isolated = await startVerificationRun(outsider, {
      projectId: seeded.project.project.id,
      reviewId: seeded.review.review.id,
      issueNumber: seeded.issue.number,
      checks: ["element_visibility"],
    });
    expect(isolated.ok).toBe(false);

    const guestCode = await createSdkExchangeCode({
      workspaceId: seeded.context.workspaceId,
      reviewId: seeded.review.review.id,
      shareLinkId: seeded.share.shareLink.id,
      guestIdentityId: seeded.guest.id,
      environmentId: seeded.installation.id,
      allowedOrigin: seeded.origin,
    });
    const guestAttempt = await exchangeVerificationSession({
      installationKey: seeded.installation.publicKey,
      exchangeCode: guestCode.rawCode,
      headerOrigin: seeded.origin,
      rateLimitSubjects: [`guest-ver-${seeded.context.userId}`],
    });
    expect(guestAttempt.ok).toBe(false);
  });

  it("records version mismatch as uncertain without moving evidence", async () => {
    const seeded = await seedIssue();
    const started = await startVerificationRun(seeded.context, {
      projectId: seeded.project.project.id,
      reviewId: seeded.review.review.id,
      issueNumber: seeded.issue.number,
      checks: ["element_visibility"],
    });
    if (!started.ok) throw new Error("start");
    const raw = new URLSearchParams(new URL(started.launchUrl).hash.slice(1)).get(
      "passoff_vx",
    );
    const exchanged = await exchangeVerificationSession({
      installationKey: seeded.installation.publicKey,
      exchangeCode: raw!,
      headerOrigin: seeded.origin,
      rateLimitSubjects: [`mm-${seeded.context.userId}`],
    });
    if (!exchanged.ok) throw new Error("exchange");
    const result = await submitVerificationResults({
      session: exchanged.session,
      corsOrigin: seeded.origin,
      idempotencyKey: "mismatch",
      payload: {
        checks: [
          {
            kind: "element_visibility",
            outcome: "passed",
            summary: "Visible",
            measurements: {},
          },
        ],
        version: { method: "application_release", value: "other-build" },
        documentReady: true,
        layoutStable: true,
      },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.overall).toBe("uncertain");
    const [run] = await db
      .select()
      .from(verificationRuns)
      .where(eq(verificationRuns.id, exchanged.session.runId));
    expect(run.failureCode).toBe("version_mismatch");
    expect(run.detectedVersion).toBe("other-build");
    expect(run.expectedVersion).not.toBe("other-build");
  });
});
