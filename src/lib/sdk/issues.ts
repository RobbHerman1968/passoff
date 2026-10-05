import "server-only";

import { and, eq, isNull } from "drizzle-orm";

import { db } from "@/db";
import {
  assets,
  issueAnchors,
  issueEvidence,
  issueIdempotencyKeys,
  issues,
  pages,
  reviewIssueCounters,
  reviews,
} from "@/db/schema";
import { ISSUE_STATUS_LABELS, type IssuePriority } from "@/lib/issues/statuses";
import { allocateIssueNumber } from "@/lib/issues/service";
import { enqueueWebhookEventSafely } from "@/lib/webhooks/enqueue";
import {
  normalizePageUrl,
} from "@/lib/sdk/page-url";
import type { SdkSession } from "@/lib/sdk/session";
import {
  sanitizeAnchor,
  sanitizeIssueBody,
  sanitizePriority,
  sanitizeScreenshot,
  type SanitizedAnchor,
  type SanitizedScreenshot,
} from "@/lib/sdk/sanitize";

export type SdkMarkerIssue = {
  id: string;
  number: number;
  status: string;
  statusLabel: string;
  summary: string;
  marker: {
    normalizedX: number;
    normalizedY: number;
    stableElementId: string | null;
    approvedDataAttributes: Record<string, string>;
    cssSelector: string | null;
    ancestryFingerprint: string | null;
    elementTag: string | null;
    accessibleName: string | null;
    documentX: number | null;
    documentY: number | null;
  };
};

function truncateSummary(body: string): string {
  const cleaned = body.replace(/\s+/g, " ").trim();
  if (cleaned.length <= 140) return cleaned;
  return `${cleaned.slice(0, 137)}…`;
}

async function ensurePage(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  session: SdkSession,
  route: string,
  pageTitle: string | null,
) {
  const normalizedRoute = route.slice(0, 2_048) || "/";
  const [existing] = await tx
    .select({ id: pages.id })
    .from(pages)
    .where(
      and(
        eq(pages.environmentId, session.environmentId),
        eq(pages.normalizedRoute, normalizedRoute),
        eq(pages.workspaceId, session.workspaceId),
      ),
    )
    .limit(1);

  if (existing) {
    if (pageTitle) {
      await tx
        .update(pages)
        .set({ lastKnownTitle: pageTitle, updatedAt: new Date() })
        .where(eq(pages.id, existing.id));
    }
    return existing.id;
  }

  const [created] = await tx
    .insert(pages)
    .values({
      workspaceId: session.workspaceId,
      projectId: session.projectId,
      environmentId: session.environmentId,
      normalizedRoute,
      lastKnownTitle: pageTitle,
    })
    .returning({ id: pages.id });

  return created.id;
}

function markerFromAnchor(row: {
  id: string;
  number: number;
  status: string;
  body: string;
  normalizedX: string | null;
  normalizedY: string | null;
  stableElementId: string | null;
  approvedDataAttributes: Record<string, string> | null;
  cssSelector: string | null;
  domFingerprint: string | null;
  selectedText: string | null;
  pageTitle: string | null;
  documentX: number | null;
  documentY: number | null;
}): SdkMarkerIssue {
  const nx = row.normalizedX != null ? Number(row.normalizedX) : 0.5;
  const ny = row.normalizedY != null ? Number(row.normalizedY) : 0.5;
  return {
    id: row.id,
    number: row.number,
    status: row.status,
    statusLabel:
      ISSUE_STATUS_LABELS[row.status as keyof typeof ISSUE_STATUS_LABELS] ??
      row.status,
    summary: truncateSummary(row.body),
    marker: {
      normalizedX: Number.isFinite(nx) ? nx : 0.5,
      normalizedY: Number.isFinite(ny) ? ny : 0.5,
      stableElementId: row.stableElementId,
      approvedDataAttributes: row.approvedDataAttributes ?? {},
      cssSelector: row.cssSelector,
      ancestryFingerprint: row.domFingerprint,
      elementTag: null,
      accessibleName: null,
      documentX: row.documentX,
      documentY: row.documentY,
    },
  };
}

export async function listSdkIssuesForPage(
  session: SdkSession,
  pageUrlRaw: string,
): Promise<{ ok: true; issues: SdkMarkerIssue[] } | { ok: false; error: "validation" }> {
  const pageUrl = normalizePageUrl(pageUrlRaw);
  if (!pageUrl) {
    return { ok: false, error: "validation" };
  }

  const rows = await db
    .select({
      id: issues.id,
      number: issues.number,
      status: issues.status,
      body: issues.body,
      normalizedX: issueAnchors.normalizedX,
      normalizedY: issueAnchors.normalizedY,
      stableElementId: issueAnchors.stableElementId,
      approvedDataAttributes: issueAnchors.approvedDataAttributes,
      cssSelector: issueAnchors.cssSelector,
      domFingerprint: issueAnchors.domFingerprint,
      selectedText: issueAnchors.selectedText,
      pageTitle: issueAnchors.pageTitle,
      documentX: issueAnchors.documentX,
      documentY: issueAnchors.documentY,
      pageUrl: issueAnchors.pageUrl,
      route: issueAnchors.route,
    })
    .from(issues)
    .innerJoin(issueAnchors, eq(issueAnchors.issueId, issues.id))
    .where(
      and(
        eq(issues.workspaceId, session.workspaceId),
        eq(issues.reviewId, session.reviewId),
        isNull(issues.deletedAt),
        eq(issueAnchors.pageUrl, pageUrl),
      ),
    )
    .orderBy(issues.number);

  return {
    ok: true,
    issues: rows.map(markerFromAnchor),
  };
}

async function loadCreatedMarker(
  issueId: string,
  workspaceId: string,
): Promise<SdkMarkerIssue | null> {
  const [row] = await db
    .select({
      id: issues.id,
      number: issues.number,
      status: issues.status,
      body: issues.body,
      normalizedX: issueAnchors.normalizedX,
      normalizedY: issueAnchors.normalizedY,
      stableElementId: issueAnchors.stableElementId,
      approvedDataAttributes: issueAnchors.approvedDataAttributes,
      cssSelector: issueAnchors.cssSelector,
      domFingerprint: issueAnchors.domFingerprint,
      selectedText: issueAnchors.selectedText,
      pageTitle: issueAnchors.pageTitle,
      documentX: issueAnchors.documentX,
      documentY: issueAnchors.documentY,
    })
    .from(issues)
    .innerJoin(issueAnchors, eq(issueAnchors.issueId, issues.id))
    .where(
      and(eq(issues.id, issueId), eq(issues.workspaceId, workspaceId)),
    )
    .limit(1);

  return row ? markerFromAnchor(row) : null;
}

export async function createSdkIssue(
  session: SdkSession,
  input: {
    body: unknown;
    priority?: unknown;
    pageUrl: unknown;
    anchor: unknown;
    screenshot?: unknown;
    idempotencyKey: string;
  },
): Promise<
  | { ok: true; issue: SdkMarkerIssue; replayed: boolean }
  | {
      ok: false;
      error:
        | "validation"
        | "forbidden"
        | "closed"
        | "unavailable"
        | "commenting_disabled";
      message?: string;
    }
> {
  if (!session.canComment) {
    return { ok: false, error: "commenting_disabled" };
  }
  if (session.reviewStatus === "closed") {
    return { ok: false, error: "closed" };
  }

  const body = sanitizeIssueBody(input.body);
  if (!body) {
    return {
      ok: false,
      error: "validation",
      message: "Enter your feedback before adding it.",
    };
  }

  const pageUrl =
    typeof input.pageUrl === "string" ? normalizePageUrl(input.pageUrl) : null;
  if (!pageUrl) {
    return {
      ok: false,
      error: "validation",
      message: "Passoff couldn’t tell which page this feedback belongs to.",
    };
  }

  const anchor = sanitizeAnchor(input.anchor);
  if (!anchor || anchor.pageUrl !== pageUrl) {
    return {
      ok: false,
      error: "validation",
      message: "Choose something on the page before adding feedback.",
    };
  }

  const priority = sanitizePriority(input.priority);
  const screenshot = sanitizeScreenshot(input.screenshot);

  const [existingKey] = await db
    .select({ issueId: issueIdempotencyKeys.issueId })
    .from(issueIdempotencyKeys)
    .where(
      and(
        eq(issueIdempotencyKeys.reviewId, session.reviewId),
        eq(issueIdempotencyKeys.idempotencyKey, input.idempotencyKey),
        eq(issueIdempotencyKeys.workspaceId, session.workspaceId),
      ),
    )
    .limit(1);

  if (existingKey) {
    const marker = await loadCreatedMarker(existingKey.issueId, session.workspaceId);
    if (marker) {
      return { ok: true, issue: marker, replayed: true };
    }
  }

  try {
    const created = await db.transaction(async (tx) => {
      const [review] = await tx
        .select({
          id: reviews.id,
          workspaceId: reviews.workspaceId,
          projectId: reviews.projectId,
          environmentId: reviews.environmentId,
          deploymentId: reviews.deploymentId,
          status: reviews.status,
          archivedAt: reviews.archivedAt,
        })
        .from(reviews)
        .where(
          and(
            eq(reviews.id, session.reviewId),
            eq(reviews.workspaceId, session.workspaceId),
          ),
        )
        .limit(1);

      if (!review || review.archivedAt) {
        return { ok: false as const, error: "forbidden" as const };
      }
      if (review.status === "closed") {
        return { ok: false as const, error: "closed" as const };
      }

      // Re-check idempotency inside the transaction.
      const [keyed] = await tx
        .select({ issueId: issueIdempotencyKeys.issueId })
        .from(issueIdempotencyKeys)
        .where(
          and(
            eq(issueIdempotencyKeys.reviewId, session.reviewId),
            eq(issueIdempotencyKeys.idempotencyKey, input.idempotencyKey),
          ),
        )
        .limit(1);
      if (keyed) {
        return { ok: true as const, issueId: keyed.issueId, replayed: true as const };
      }

      // Ensure counter row exists for older reviews.
      await tx
        .insert(reviewIssueCounters)
        .values({ reviewId: review.id, nextIssueNumber: 1 })
        .onConflictDoNothing();

      const pageId = await ensurePage(tx, session, anchor.route, anchor.pageTitle);
      const number = await allocateIssueNumber(tx, review.id);

      const [issue] = await tx
        .insert(issues)
        .values({
          workspaceId: review.workspaceId,
          projectId: review.projectId,
          environmentId: review.environmentId,
          deploymentId: review.deploymentId,
          reviewId: review.id,
          pageId,
          number,
          body,
          status: "open",
          priority: priority as IssuePriority,
          authorGuestId: session.guestIdentityId,
          version: 1,
        })
        .returning({ id: issues.id, number: issues.number });

      let screenshotAssetId: string | null = null;
      let screenshotCaptureKind:
        | "browser_reconstruction"
        | "worker_capture"
        | "manual_attachment"
        | null = null;
      let screenshotUnavailableReason: string | null = null;

      if (screenshot.status === "unavailable" || !screenshot.base64) {
        screenshotUnavailableReason =
          screenshot.reason ??
          "Passoff couldn’t capture a picture of this page.";
      } else {
        screenshotCaptureKind = "browser_reconstruction";
        const storageKey = `sdk-screenshots/${review.workspaceId}/${issue.id}.png`;
        const [asset] = await tx
          .insert(assets)
          .values({
            workspaceId: review.workspaceId,
            reviewId: review.id,
            kind: "screenshot",
            status: "ready",
            storageProvider: "inline",
            storageKey,
            mimeType: screenshot.mimeType ?? "image/png",
            byteSize: screenshot.byteLength,
            originalFileName: `issue-${issue.number}.png`,
          })
          .returning({ id: assets.id });
        screenshotAssetId = asset.id;

        await tx.insert(issueEvidence).values({
          workspaceId: review.workspaceId,
          issueId: issue.id,
          assetId: asset.id,
          kind: "screenshot",
          captureMethod: "browser_reconstruction",
          captureStatus: "ready",
          sanitizedContext: {
            mimeType: screenshot.mimeType,
            byteLength: screenshot.byteLength,
            // Inline storage for SDK screenshots until object storage is wired.
            // Bounded by sanitizeScreenshot.
            pngBase64: screenshot.base64,
            ...(screenshot.annotation
              ? { annotation: screenshot.annotation }
              : {}),
          },
          capturedAt: anchor.capturedAt ?? new Date(),
          createdByGuestId: session.guestIdentityId,
        });
      }

      if (screenshot.status === "unavailable") {
        await tx.insert(issueEvidence).values({
          workspaceId: review.workspaceId,
          issueId: issue.id,
          kind: "screenshot",
          captureMethod: "browser_reconstruction",
          captureStatus: "unavailable",
          sanitizedContext: {
            reason: screenshotUnavailableReason,
          },
          capturedAt: anchor.capturedAt ?? new Date(),
          createdByGuestId: session.guestIdentityId,
        });
      }

      await tx.insert(issueEvidence).values({
        workspaceId: review.workspaceId,
        issueId: issue.id,
        kind: "technical_context",
        captureMethod: "browser_reconstruction",
        captureStatus: "ready",
        sanitizedContext: technicalContextFromAnchor(anchor, screenshot),
        capturedAt: anchor.capturedAt ?? new Date(),
        createdByGuestId: session.guestIdentityId,
      });

      await tx.insert(issueAnchors).values({
        issueId: issue.id,
        workspaceId: review.workspaceId,
        pageUrl: anchor.pageUrl,
        route: anchor.route,
        pageTitle: anchor.pageTitle,
        selectedText: anchor.selectedText,
        stableElementId: anchor.stableElementId,
        approvedDataAttributes: anchor.approvedDataAttributes,
        domFingerprint: anchor.ancestryFingerprint,
        cssSelector: anchor.cssSelector,
        normalizedX:
          anchor.normalizedX != null ? String(anchor.normalizedX) : null,
        normalizedY:
          anchor.normalizedY != null ? String(anchor.normalizedY) : null,
        documentX: anchor.documentX,
        documentY: anchor.documentY,
        elementBounds: anchor.elementBounds,
        viewportWidth: anchor.viewportWidth,
        viewportHeight: anchor.viewportHeight,
        browser: anchor.browser,
        operatingSystem: anchor.operatingSystem,
        devicePixelRatio:
          anchor.devicePixelRatio != null
            ? String(anchor.devicePixelRatio)
            : null,
        applicationBuildId: anchor.applicationBuildId,
        matchConfidence: "unchecked",
        screenshotAssetId,
        screenshotCaptureKind,
        screenshotUnavailableReason,
        capturedAt: anchor.capturedAt ?? new Date(),
      });

      await tx.insert(issueIdempotencyKeys).values({
        workspaceId: review.workspaceId,
        reviewId: review.id,
        reviewSessionId: session.sessionId,
        idempotencyKey: input.idempotencyKey,
        issueId: issue.id,
      });

      return { ok: true as const, issueId: issue.id, replayed: false as const };
    });

    if (!created.ok) {
      return { ok: false, error: created.error };
    }

    const marker = await loadCreatedMarker(created.issueId, session.workspaceId);
    if (!marker) {
      return { ok: false, error: "unavailable" };
    }
    if (!created.replayed) {
      await enqueueWebhookEventSafely({
        eventId: created.issueId,
        subscribedType: "issue.created",
        eventType: "issue.created",
        occurredAt: new Date().toISOString(),
        workspaceId: session.workspaceId,
        projectId: session.projectId,
        reviewId: session.reviewId,
        issueId: created.issueId,
        issueNumber: marker.number,
        actor: { type: "guest", name: session.guestName },
        data: { status: marker.status },
      });
    }
    return { ok: true, issue: marker, replayed: created.replayed };
  } catch {
    // Unique idempotency race — return the winner.
    const [race] = await db
      .select({ issueId: issueIdempotencyKeys.issueId })
      .from(issueIdempotencyKeys)
      .where(
        and(
          eq(issueIdempotencyKeys.reviewId, session.reviewId),
          eq(issueIdempotencyKeys.idempotencyKey, input.idempotencyKey),
        ),
      )
      .limit(1);
    if (race) {
      const marker = await loadCreatedMarker(race.issueId, session.workspaceId);
      if (marker) {
        return { ok: true, issue: marker, replayed: true };
      }
    }
    return { ok: false, error: "unavailable" };
  }
}

function technicalContextFromAnchor(
  anchor: SanitizedAnchor,
  screenshot: SanitizedScreenshot,
): Record<string, unknown> {
  return {
    elementTag: anchor.elementTag,
    accessibleRole: anchor.accessibleRole,
    accessibleName: anchor.accessibleName,
    private: anchor.private,
    viewport: {
      width: anchor.viewportWidth,
      height: anchor.viewportHeight,
    },
    browser: anchor.browser,
    operatingSystem: anchor.operatingSystem,
    devicePixelRatio: anchor.devicePixelRatio,
    applicationBuildId: anchor.applicationBuildId,
    screenshotStatus: screenshot.status,
    screenshotReason: screenshot.reason,
  };
}
