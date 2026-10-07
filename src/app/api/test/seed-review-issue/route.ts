import { and, eq, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";

import { db } from "@/db";
import {
  assets,
  issueAnchors,
  issueComments,
  issueEvidence,
  issues,
  reviewIssueCounters,
  reviews,
  users,
  videoAnnotations,
  videoAssets,
  workspaceMemberships,
  workspaces,
} from "@/db/schema";
import { normalizeEmail } from "@/lib/auth/email";
import { allocateIssueNumber } from "@/lib/issues/service";
import type { IssuePriority, IssueStatus } from "@/lib/issues/statuses";
import { createProject, createWebsiteReview } from "@/lib/projects/service";
import type { WorkspaceContext } from "@/lib/workspaces/context";
import { testRoutesEnabled } from "@/lib/security/production-guards";

const TINY_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

async function resolveOwnerContext(ownerEmail: string): Promise<WorkspaceContext | null> {
  const [owner] = await db
    .select({
      userId: users.id,
      userName: users.name,
      userEmail: users.email,
      membershipId: workspaceMemberships.id,
      role: workspaceMemberships.role,
      workspaceId: workspaces.id,
      workspaceName: workspaces.name,
      workspaceSlug: workspaces.slug,
    })
    .from(users)
    .innerJoin(
      workspaceMemberships,
      and(
        eq(workspaceMemberships.userId, users.id),
        eq(workspaceMemberships.status, "active"),
        eq(workspaceMemberships.role, "owner"),
      ),
    )
    .innerJoin(
      workspaces,
      and(
        eq(workspaces.id, workspaceMemberships.workspaceId),
        isNull(workspaces.deletedAt),
      ),
    )
    .where(eq(users.email, ownerEmail))
    .limit(1);

  if (!owner) return null;

  return {
    membershipId: owner.membershipId,
    workspaceId: owner.workspaceId,
    workspaceName: owner.workspaceName,
    workspaceSlug: owner.workspaceSlug,
    role: owner.role,
    userId: owner.userId,
    userName: owner.userName,
    userEmail: owner.userEmail,
  };
}

/**
 * Test helper: seed a review issue with optional screenshot evidence.
 * Can also create a project + review when `createReview` is true.
 * Requires EMAIL_TRANSPORT=test.
 */
export async function POST(request: Request) {
  if (!testRoutesEnabled()) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = (await request.json().catch(() => null)) as {
    ownerEmail?: string;
    reviewId?: string;
    createReview?: boolean;
    projectName?: string;
    reviewName?: string;
    websiteUrl?: string;
    issueBody?: string;
    priority?: IssuePriority;
    status?: IssueStatus;
    pageRoute?: string;
    pageTitle?: string;
    screenshotStatus?: "ready" | "pending" | "unavailable" | "failed" | "none";
    /** Adds an earlier, replaced video with one note on it. Nothing is ever played. */
    earlierVideoNote?: { timestampMs: number; body: string };
  } | null;

  const ownerEmail =
    typeof body?.ownerEmail === "string"
      ? normalizeEmail(body.ownerEmail)
      : "";
  const issueBody =
    typeof body?.issueBody === "string" && body.issueBody.trim()
      ? body.issueBody.trim()
      : "Seeded review issue";
  const priority = body?.priority ?? "normal";
  const status = body?.status ?? "open";
  const pageRoute = body?.pageRoute ?? "/pricing";
  const pageTitle = body?.pageTitle ?? "Pricing";
  const screenshotStatus = body?.screenshotStatus ?? "ready";

  if (!ownerEmail) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const context = await resolveOwnerContext(ownerEmail);
  if (!context) {
    return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
  }

  let projectId: string;
  let reviewId: string;

  if (body?.createReview) {
    const project = await createProject(
      context,
      typeof body.projectName === "string" && body.projectName.trim()
        ? body.projectName.trim()
        : "Issue Project",
    );
    if (!project.ok) {
      return NextResponse.json({ error: "Could not create project" }, { status: 500 });
    }
    const review = await createWebsiteReview(context, {
      projectId: project.project.id,
      name:
        typeof body.reviewName === "string" && body.reviewName.trim()
          ? body.reviewName.trim()
          : "Homepage issues",
      websiteUrl:
        typeof body.websiteUrl === "string" && body.websiteUrl.trim()
          ? body.websiteUrl.trim()
          : "https://example.com/start",
    });
    if (!review.ok) {
      return NextResponse.json({ error: "Could not create review" }, { status: 500 });
    }
    projectId = project.project.id;
    reviewId = review.review.id;
  } else {
    reviewId = typeof body?.reviewId === "string" ? body.reviewId : "";
    if (!reviewId) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }
    const [review] = await db
      .select({
        id: reviews.id,
        projectId: reviews.projectId,
      })
      .from(reviews)
      .where(
        and(eq(reviews.id, reviewId), eq(reviews.workspaceId, context.workspaceId)),
      )
      .limit(1);
    if (!review) {
      return NextResponse.json({ error: "Review not found" }, { status: 404 });
    }
    projectId = review.projectId;
  }

  const [review] = await db
    .select({
      id: reviews.id,
      workspaceId: reviews.workspaceId,
      projectId: reviews.projectId,
      environmentId: reviews.environmentId,
      deploymentId: reviews.deploymentId,
    })
    .from(reviews)
    .where(
      and(eq(reviews.id, reviewId), eq(reviews.workspaceId, context.workspaceId)),
    )
    .limit(1);

  if (!review) {
    return NextResponse.json({ error: "Review not found" }, { status: 404 });
  }

  try {
    const created = await db.transaction(async (tx) => {
      await tx
        .insert(reviewIssueCounters)
        .values({ reviewId: review.id, nextIssueNumber: 1 })
        .onConflictDoNothing();

      const number = await allocateIssueNumber(tx, review.id);
      const now = new Date();
      const [issue] = await tx
        .insert(issues)
        .values({
          workspaceId: review.workspaceId,
          projectId: review.projectId,
          environmentId: review.environmentId,
          deploymentId: review.deploymentId,
          reviewId: review.id,
          number,
          body: issueBody,
          status,
          priority,
          authorUserId: context.userId,
          closureReason: status === "closed" ? "not_planned" : null,
          closedAt: status === "closed" ? now : null,
          closedByUserId: status === "closed" ? context.userId : null,
          verifiedAt: status === "verified" ? now : null,
          version: 1,
        })
        .returning({ id: issues.id, number: issues.number });

      await tx.insert(issueAnchors).values({
        issueId: issue.id,
        workspaceId: review.workspaceId,
        pageUrl: `https://example.com${pageRoute}`,
        route: pageRoute,
        pageTitle,
        viewportWidth: 1280,
        viewportHeight: 720,
        screenshotCaptureKind:
          screenshotStatus === "ready" ? "browser_reconstruction" : null,
      });

      if (screenshotStatus !== "none") {
        await tx.insert(issueEvidence).values({
          workspaceId: review.workspaceId,
          issueId: issue.id,
          kind: "screenshot",
          captureMethod: "browser_reconstruction",
          captureStatus: screenshotStatus,
          sanitizedContext:
            screenshotStatus === "ready"
              ? { pngBase64: TINY_PNG_BASE64 }
              : { reason: "seeded unavailable screenshot" },
          capturedAt: now,
          createdByUserId: context.userId,
        });
      }

      if (body?.earlierVideoNote) {
        const note = body.earlierVideoNote;
        const [original] = await tx
          .insert(assets)
          .values({
            workspaceId: review.workspaceId,
            reviewId: review.id,
            kind: "video_original",
            status: "ready",
            storageProvider: "mux",
            storageKey: `seeded-earlier:${issue.id}`,
            durationMs: 30_000,
            uploadedByUserId: context.userId,
          })
          .returning({ id: assets.id });
        const [evidence] = await tx
          .insert(issueEvidence)
          .values({
            workspaceId: review.workspaceId,
            issueId: issue.id,
            assetId: original.id,
            kind: "video",
            captureMethod: "manual_attachment",
            captureStatus: "ready",
            createdByUserId: context.userId,
          })
          .returning({ id: issueEvidence.id });
        const [clip] = await tx
          .insert(videoAssets)
          .values({
            workspaceId: review.workspaceId,
            issueId: issue.id,
            evidenceId: evidence.id,
            originalAssetId: original.id,
            lifecycle: "retired",
            removalReason: "replaced",
            removedAt: now,
            durationMs: 30_000,
            declaredDurationMs: 30_000,
            processingStatus: "ready",
          })
          .returning({ id: videoAssets.id });
        const [comment] = await tx
          .insert(issueComments)
          .values({
            workspaceId: review.workspaceId,
            issueId: issue.id,
            body: note.body,
            isPrivate: false,
            authorUserId: context.userId,
            authorDisplayName: context.userName ?? "Owner",
          })
          .returning({ id: issueComments.id });
        await tx.insert(videoAnnotations).values({
          workspaceId: review.workspaceId,
          issueId: issue.id,
          commentId: comment.id,
          videoAssetId: clip.id,
          timestampMs: note.timestampMs,
          durationAtCreationMs: 30_000,
        });
      }

      return issue;
    });

    return NextResponse.json({
      ok: true,
      projectId,
      reviewId,
      issueId: created.id,
      issueNumber: created.number,
    });
  } catch {
    return NextResponse.json({ error: "Could not seed issue" }, { status: 500 });
  }
}
