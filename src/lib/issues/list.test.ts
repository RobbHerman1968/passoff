import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { db } from "@/db";
import {
  issueEvidence,
  issues,
  projectEnvironments,
  reviews,
  workspaceMemberships,
  workspaces,
} from "@/db/schema";
import { createCredentialsUser } from "@/lib/auth/users";
import { createOwnerWorkspace } from "@/lib/auth/workspace";
import {
  getIssueDetailForReview,
  getIssueScreenshotForReview,
  listIssuesForReview,
} from "@/lib/issues/list";
import { ISSUE_LIST_PAGE_SIZE } from "@/lib/issues/schemas";
import { createIssue } from "@/lib/issues/service";
import { createProject, createWebsiteReview } from "@/lib/projects/service";
import {
  createSdkExchangeCode,
  createShareLink,
  upsertGuestIdentity,
} from "@/lib/reviews/share-links";
import { createSdkIssue } from "@/lib/sdk/issues";
import { exchangeSdkSession, resolveSdkSession } from "@/lib/sdk/session";
import type { WorkspaceContext } from "@/lib/workspaces/context";

const uniqueEmail = (label: string) =>
  `${label}.${Date.now()}.${Math.random().toString(16).slice(2)}@example.com`;

const TINY_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

async function createWorkspaceContext(label: string): Promise<WorkspaceContext> {
  const created = await createCredentialsUser({
    firstName: "Issue",
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

async function seedReview(label: string, origin = "https://issues.example.com") {
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

function bearerRequest(token: string, origin: string) {
  return new Request("https://app.example.com/api/sdk/v1/issues", {
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
    approvedDataAttributes: {},
    cssSelector: "h1",
    ancestryFingerprint: "main>h1",
    accessibleName: pageTitle,
    accessibleRole: "heading",
    stableElementId: null,
  };
}

async function sdkSessionFor(seeded: Awaited<ReturnType<typeof seedReview>>) {
  const exchanged = await exchangeSdkSession({
    installationKey: seeded.installation.publicKey,
    exchangeCode: seeded.exchange.rawCode,
    headerOrigin: seeded.origin,
    rateLimitSubjects: ["fp"],
  });
  if (!exchanged.ok) throw new Error("exchange failed");
  const resolved = await resolveSdkSession(
    bearerRequest(exchanged.sessionToken, seeded.origin),
  );
  if (!resolved.ok) throw new Error("resolve failed");
  return resolved.session;
}

describe("listIssuesForReview", () => {
  it(
    "enforces workspace, project, and review isolation and hides soft-deleted issues",
    { timeout: 60_000 },
    async () => {
      const workspaceA = await seedReview("lista", "https://a.issues.example.com");
      const workspaceB = await seedReview("listb", "https://b.issues.example.com");

      const memberIssue = await createIssue(workspaceA.context, {
        reviewId: workspaceA.reviewId,
        body: "Member-authored header overlap",
        priority: "high",
      });
      expect(memberIssue.ok).toBe(true);
      if (!memberIssue.ok) return;

      const sessionB = await sdkSessionFor(workspaceB);
      const guestIssue = await createSdkIssue(sessionB, {
        body: "Guest issue in other workspace",
        pageUrl: `${workspaceB.origin}/start`,
        anchor: baseAnchor(workspaceB.origin),
        screenshot: { status: "unavailable", reason: "none" },
        idempotencyKey: `iso_${Date.now()}`,
      });
      expect(guestIssue.ok).toBe(true);

      const listA = await listIssuesForReview(
        workspaceA.context,
        workspaceA.projectId,
        workspaceA.reviewId,
        { q: "", show: "active", p: 1 },
      );
      expect(listA).not.toBeNull();
      expect(listA?.items.map((item) => item.number)).toEqual([
        memberIssue.issue.number,
      ]);
      expect(listA?.items[0]?.assigneeDisplayName).toBe("Unassigned");

      expect(
        await listIssuesForReview(
          workspaceA.context,
          workspaceB.projectId,
          workspaceB.reviewId,
          { q: "", show: "active", p: 1 },
        ),
      ).toBeNull();

      expect(
        await listIssuesForReview(
          workspaceA.context,
          workspaceA.projectId,
          workspaceB.reviewId,
          { q: "", show: "active", p: 1 },
        ),
      ).toBeNull();

      await db
        .update(issues)
        .set({ deletedAt: new Date() })
        .where(eq(issues.id, memberIssue.issue.id));

      const afterDelete = await listIssuesForReview(
        workspaceA.context,
        workspaceA.projectId,
        workspaceA.reviewId,
        { q: "", show: "all", p: 1 },
      );
      expect(afterDelete?.items).toEqual([]);
    },
  );

  it(
    "defaults to active issues, supports search/filters/sort/pagination, and preview selection",
    { timeout: 90_000 },
    async () => {
      const seeded = await seedReview("filters", "https://filters.example.com");
      const session = await sdkSessionFor(seeded);

      const readyAnnotation = {
        version: 1 as const,
        selectedBounds: { x: 0.12, y: 0.18, width: 0.22, height: 0.1 },
        pin: { x: 0.2, y: 0.22 },
      };
      const guestReady = await createSdkIssue(session, {
        body: "Header overlaps navigation on pricing",
        priority: "high",
        pageUrl: `${seeded.origin}/pricing`,
        anchor: baseAnchor(seeded.origin, "/pricing", "Pricing page"),
        screenshot: {
          status: "captured",
          dataUrl: `data:image/png;base64,${TINY_PNG_BASE64}`,
          annotation: readyAnnotation,
        },
        idempotencyKey: `ready_${Date.now()}`,
      });
      expect(guestReady.ok).toBe(true);
      if (!guestReady.ok) return;

      const guestPending = await createSdkIssue(session, {
        body: "Footer contrast is low",
        priority: "low",
        pageUrl: `${seeded.origin}/about`,
        anchor: baseAnchor(seeded.origin, "/about", "About us"),
        screenshot: { status: "unavailable", reason: "capture skipped" },
        idempotencyKey: `pending_${Date.now()}`,
      });
      expect(guestPending.ok).toBe(true);
      if (!guestPending.ok) return;

      const memberIssue = await createIssue(seeded.context, {
        reviewId: seeded.reviewId,
        body: "Workspace member notes a checkout bug",
        priority: "urgent",
      });
      expect(memberIssue.ok).toBe(true);
      if (!memberIssue.ok) return;

      await db
        .update(issues)
        .set({ status: "verified", verifiedAt: new Date(), updatedAt: new Date() })
        .where(eq(issues.id, memberIssue.issue.id));

      const closed = await createIssue(seeded.context, {
        reviewId: seeded.reviewId,
        body: "Old closed issue about colors",
      });
      expect(closed.ok).toBe(true);
      if (!closed.ok) return;
      await db
        .update(issues)
        .set({
          status: "closed",
          closureReason: "not_planned",
          closedAt: new Date(),
          closedByUserId: seeded.context.userId,
          updatedAt: new Date(Date.now() - 60_000),
        })
        .where(eq(issues.id, closed.issue.id));

      // Seed a second assignee-capable member and assign one issue.
      const memberUser = await createCredentialsUser({
        firstName: "Assigned",
        lastName: "Dev",
        email: uniqueEmail("assignee"),
        password: "long-enough-password",
      });
      if (!memberUser.ok) throw new Error("assignee user failed");
      await db.insert(workspaceMemberships).values({
        workspaceId: seeded.context.workspaceId,
        userId: memberUser.user.id,
        role: "member",
        status: "active",
      });
      await db
        .update(issues)
        .set({ assigneeUserId: memberUser.user.id })
        .where(eq(issues.id, guestPending.issue.id));

      // Attach a video evidence row for the has-video filter.
      await db.insert(issueEvidence).values({
        workspaceId: seeded.context.workspaceId,
        issueId: guestReady.issue.id,
        kind: "video",
        captureMethod: "host_upload",
        captureStatus: "ready",
        sanitizedContext: {},
      });

      // Mark unavailable screenshot evidence as pending for one issue path.
      await db
        .update(issueEvidence)
        .set({ captureStatus: "pending" })
        .where(
          and(
            eq(issueEvidence.issueId, guestPending.issue.id),
            eq(issueEvidence.kind, "screenshot"),
          ),
        );

      const active = await listIssuesForReview(
        seeded.context,
        seeded.projectId,
        seeded.reviewId,
        { q: "", show: "active", p: 1 },
      );
      expect(active?.items.map((item) => item.number).sort()).toEqual(
        [guestReady.issue.number, guestPending.issue.number].sort(),
      );

      const byNumber = await listIssuesForReview(
        seeded.context,
        seeded.projectId,
        seeded.reviewId,
        { q: String(guestReady.issue.number), show: "all", p: 1 },
      );
      expect(byNumber?.items).toHaveLength(1);
      expect(byNumber?.items[0]?.number).toBe(guestReady.issue.number);

      const byBody = await listIssuesForReview(
        seeded.context,
        seeded.projectId,
        seeded.reviewId,
        { q: "header overlaps", show: "all", p: 1 },
      );
      expect(byBody?.items[0]?.displayTitle).toMatch(/Header overlaps/i);

      const byPageTitle = await listIssuesForReview(
        seeded.context,
        seeded.projectId,
        seeded.reviewId,
        { q: "Pricing page", show: "all", p: 1 },
      );
      expect(byPageTitle?.items[0]?.pageTitle).toBe("Pricing page");

      const byRoute = await listIssuesForReview(
        seeded.context,
        seeded.projectId,
        seeded.reviewId,
        { q: "/about", show: "all", p: 1 },
      );
      expect(byRoute?.items[0]?.pageRoute).toBe("/about");

      const byPriority = await listIssuesForReview(
        seeded.context,
        seeded.projectId,
        seeded.reviewId,
        { q: "", show: "all", priority: "high", p: 1 },
      );
      expect(byPriority?.items.every((item) => item.priority === "high")).toBe(
        true,
      );

      const byAssignee = await listIssuesForReview(
        seeded.context,
        seeded.projectId,
        seeded.reviewId,
        {
          q: "",
          show: "all",
          assignee: memberUser.user.id,
          p: 1,
        },
      );
      expect(byAssignee?.items).toHaveLength(1);
      expect(byAssignee?.items[0]?.assigneeDisplayName).toContain("Assigned");

      const unassigned = await listIssuesForReview(
        seeded.context,
        seeded.projectId,
        seeded.reviewId,
        { q: "", show: "all", assignee: "unassigned", p: 1 },
      );
      expect(
        unassigned?.items.every((item) => item.assigneeDisplayName === "Unassigned"),
      ).toBe(true);

      const byPage = await listIssuesForReview(
        seeded.context,
        seeded.projectId,
        seeded.reviewId,
        { q: "", show: "all", page: "/pricing", p: 1 },
      );
      expect(byPage?.items.every((item) => item.pageRoute === "/pricing")).toBe(
        true,
      );

      const byVideo = await listIssuesForReview(
        seeded.context,
        seeded.projectId,
        seeded.reviewId,
        { q: "", show: "all", video: true, p: 1 },
      );
      expect(byVideo?.items).toHaveLength(1);
      expect(byVideo?.items[0]?.hasVideoEvidence).toBe(true);

      const verified = await listIssuesForReview(
        seeded.context,
        seeded.projectId,
        seeded.reviewId,
        { q: "", show: "verified", p: 1 },
      );
      expect(verified?.items.map((item) => item.status)).toEqual(["verified"]);

      const closedList = await listIssuesForReview(
        seeded.context,
        seeded.projectId,
        seeded.reviewId,
        { q: "", show: "closed", p: 1 },
      );
      expect(closedList?.items.map((item) => item.status)).toEqual(["closed"]);

      const sorted = await listIssuesForReview(
        seeded.context,
        seeded.projectId,
        seeded.reviewId,
        { q: "", show: "all", p: 1 },
      );
      const updatedTimes = sorted?.items.map((item) => item.updatedAt.getTime()) ?? [];
      expect(updatedTimes).toEqual([...updatedTimes].sort((a, b) => b - a));

      // Pagination stability with enough rows for a second page.
      const [reviewScope] = await db
        .select({
          workspaceId: reviews.workspaceId,
          projectId: reviews.projectId,
          environmentId: reviews.environmentId,
          deploymentId: reviews.deploymentId,
        })
        .from(reviews)
        .where(eq(reviews.id, seeded.reviewId))
        .limit(1);
      const existingCount = sorted?.total ?? 0;
      const fillersNeeded = ISSUE_LIST_PAGE_SIZE - existingCount + 2;
      const now = Date.now();
      await db.insert(issues).values(
        Array.from({ length: Math.max(fillersNeeded, 0) }, (_, index) => ({
          workspaceId: reviewScope.workspaceId,
          projectId: reviewScope.projectId,
          environmentId: reviewScope.environmentId,
          deploymentId: reviewScope.deploymentId,
          reviewId: seeded.reviewId,
          number: 1000 + index,
          body: `Pagination filler ${index}`,
          status: "open" as const,
          priority: "normal" as const,
          authorUserId: seeded.context.userId,
          version: 1,
          updatedAt: new Date(now - index * 1000),
        })),
      );
      const page1 = await listIssuesForReview(
        seeded.context,
        seeded.projectId,
        seeded.reviewId,
        { q: "", show: "all", p: 1 },
      );
      const page2 = await listIssuesForReview(
        seeded.context,
        seeded.projectId,
        seeded.reviewId,
        { q: "", show: "all", p: 2 },
      );
      expect(page1?.pageCount).toBeGreaterThan(1);
      expect(page1?.items).toHaveLength(ISSUE_LIST_PAGE_SIZE);
      expect(page2?.items.length).toBeGreaterThan(0);
      const page1Ids = new Set(page1?.items.map((item) => item.id));
      expect(page2?.items.every((item) => !page1Ids.has(item.id))).toBe(true);

      const detail = await getIssueDetailForReview(
        seeded.context,
        seeded.projectId,
        seeded.reviewId,
        guestReady.issue.number,
      );
      expect(detail).not.toBeNull();
      expect(detail).not.toBe("unavailable");
      if (!detail || detail === "unavailable") return;
      expect(detail.body).toContain("Header overlaps");
      expect(detail.screenshotCaptureStatus).toBe("ready");
      expect(detail.environmentName).toBeTruthy();
      expect(detail.versionLabel).toBeTruthy();
      expect(detail.pageUrl).toBeTruthy();
      expect(detail.screenshotAnnotation).toEqual(readyAnnotation);
      expect(JSON.stringify(detail)).not.toContain("pngBase64");
      expect(JSON.stringify(detail)).not.toContain(TINY_PNG_BASE64);
      expect(JSON.stringify(detail)).not.toContain("sdk-screenshots/");

      const [storedEvidence] = await db
        .select({ sanitizedContext: issueEvidence.sanitizedContext })
        .from(issueEvidence)
        .where(
          and(
            eq(issueEvidence.issueId, guestReady.issue.id),
            eq(issueEvidence.kind, "screenshot"),
          ),
        )
        .limit(1);
      expect(storedEvidence?.sanitizedContext).toMatchObject({
        annotation: readyAnnotation,
      });

      expect(
        await getIssueDetailForReview(
          seeded.context,
          seeded.projectId,
          seeded.reviewId,
          999_999,
        ),
      ).toBe("unavailable");

      const otherWorkspace = await createWorkspaceContext("detail-other");
      expect(
        await getIssueDetailForReview(
          otherWorkspace,
          seeded.projectId,
          seeded.reviewId,
          guestReady.issue.number,
        ),
      ).toBeNull();

      const readyShot = await getIssueScreenshotForReview(
        seeded.context,
        seeded.projectId,
        seeded.reviewId,
        guestReady.issue.number,
      );
      expect(readyShot.ok).toBe(true);
      if (readyShot.ok) {
        expect(readyShot.mimeType).toBe("image/png");
        expect(readyShot.bytes[0]).toBe(0x89);
      }

      const pendingShot = await getIssueScreenshotForReview(
        seeded.context,
        seeded.projectId,
        seeded.reviewId,
        guestPending.issue.number,
      );
      expect(pendingShot).toEqual({ ok: false, status: "pending" });

      // Cross-workspace screenshot access must not reveal the image.
      const other = await createWorkspaceContext("shot-other");
      const blocked = await getIssueScreenshotForReview(
        other,
        seeded.projectId,
        seeded.reviewId,
        guestReady.issue.number,
      );
      expect(blocked).toEqual({ ok: false, status: "not_found" });

      // Failed / unavailable states.
      await db
        .update(issueEvidence)
        .set({ captureStatus: "failed", sanitizedContext: {} })
        .where(
          and(
            eq(issueEvidence.issueId, guestPending.issue.id),
            eq(issueEvidence.kind, "screenshot"),
          ),
        );
      expect(
        await getIssueScreenshotForReview(
          seeded.context,
          seeded.projectId,
          seeded.reviewId,
          guestPending.issue.number,
        ),
      ).toEqual({ ok: false, status: "failed" });

      await db
        .update(issueEvidence)
        .set({ captureStatus: "unavailable", sanitizedContext: { reason: "x" } })
        .where(
          and(
            eq(issueEvidence.issueId, guestPending.issue.id),
            eq(issueEvidence.kind, "screenshot"),
          ),
        );
      expect(
        await getIssueScreenshotForReview(
          seeded.context,
          seeded.projectId,
          seeded.reviewId,
          guestPending.issue.number,
        ),
      ).toEqual({ ok: false, status: "unavailable" });
    },
  );

  it("returns an empty list for a review with no issues", async () => {
    const seeded = await seedReview("empty", "https://empty.example.com");
    const list = await listIssuesForReview(
      seeded.context,
      seeded.projectId,
      seeded.reviewId,
      { q: "", show: "active", p: 1 },
    );
    expect(list?.items).toEqual([]);
    expect(list?.total).toBe(0);
  });
});
