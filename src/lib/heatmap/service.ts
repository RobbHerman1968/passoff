import "server-only";

import { and, desc, eq, isNull, or, sql } from "drizzle-orm";

import { db } from "@/db";
import { deployments, issueAnchors, issues, pages, projectEnvironments, reviews } from "@/db/schema";
import { deriveIssueDisplayTitle } from "@/lib/issues/display-title";
import {
  ISSUE_PRIORITY_LABELS,
  ISSUE_STATUS_LABELS,
  OPEN_ISSUE_STATUSES,
  type IssuePriority,
  type IssueStatus,
} from "@/lib/issues/statuses";
import { normalizeOrigin } from "@/lib/installations/origin";
import { normalizePageUrl, pageRouteFromUrl } from "@/lib/sdk/page-url";
import type { SdkSession } from "@/lib/sdk/session";

export type HeatmapSdkIssue = {
  id: string;
  number: number;
  title: string;
  status: IssueStatus;
  statusLabel: string;
  priority: IssuePriority;
  priorityLabel: string;
  assigneeDisplayName: string | null;
  groupLabel: string;
  marker: {
    stableElementId: string | null;
    approvedDataAttributes: Record<string, string>;
    accessibleName: string | null;
    selectedText: string | null;
    pageTitle: string | null;
    heading: string | null;
    region: string | null;
  };
};

export type HeatmapPageMeta = {
  pageRoute: string;
  environmentName: string;
  versionLabel: string;
};

function heatmapLabel(row: {
  selectedText: string | null;
  pageTitle: string | null;
  approvedDataAttributes: Record<string, string> | null;
}): string {
  const attrs = row.approvedDataAttributes ?? {};
  const accessible =
    attrs["aria-label"] ??
    attrs["data-passoff-anchor"] ??
    attrs["data-passoff-label"];
  if (accessible?.trim()) return accessible.trim().slice(0, 80);
  if (row.pageTitle?.trim()) return row.pageTitle.trim().slice(0, 80);
  if (row.selectedText?.trim()) return row.selectedText.trim().slice(0, 80);
  return "Page area";
}

export function pageUrlAllowedForSession(pageUrl: string, allowedOrigin: string): boolean {
  const origin = normalizeOrigin(pageUrl);
  return origin.ok && origin.origin === allowedOrigin;
}

export async function listHeatmapIssuesForPage(
  session: SdkSession,
  pageUrlRaw: string,
  filters: {
    show?: "active" | "verified" | "closed" | "all";
    priority?: IssuePriority;
    version?: string;
  },
): Promise<
  | { ok: true; issues: HeatmapSdkIssue[]; meta: HeatmapPageMeta }
  | { ok: false; error: "validation" | "origin" }
> {
  const pageUrl = normalizePageUrl(pageUrlRaw);
  if (!pageUrl) return { ok: false, error: "validation" };
  if (!pageUrlAllowedForSession(pageUrl, session.allowedOrigin)) {
    return { ok: false, error: "origin" };
  }
  const route = pageRouteFromUrl(pageUrl);

  const conditions = [
    eq(issues.workspaceId, session.workspaceId),
    eq(issues.reviewId, session.reviewId),
    isNull(issues.deletedAt),
    or(
      eq(issueAnchors.pageUrl, pageUrl),
      eq(issueAnchors.route, route),
      eq(pages.normalizedRoute, route),
    )!,
  ];

  const show = filters.show ?? "active";
  if (show === "active") {
    conditions.push(
      sql`${issues.status}::text in (${sql.join(
        OPEN_ISSUE_STATUSES.map((status) => sql`${status}`),
        sql`, `,
      )})`,
    );
  } else if (show === "verified") {
    conditions.push(eq(issues.status, "verified"));
  } else if (show === "closed") {
    conditions.push(eq(issues.status, "closed"));
  }

  if (filters.priority) {
    conditions.push(eq(issues.priority, filters.priority));
  }
  if (filters.version) {
    conditions.push(eq(issueAnchors.applicationBuildId, filters.version));
  }

  const rows = await db
    .select({
      id: issues.id,
      number: issues.number,
      body: issues.body,
      status: issues.status,
      priority: issues.priority,
      stableElementId: issueAnchors.stableElementId,
      approvedDataAttributes: issueAnchors.approvedDataAttributes,
      selectedText: issueAnchors.selectedText,
      pageTitle: issueAnchors.pageTitle,
      environmentName: projectEnvironments.name,
      versionLabel: deployments.identifier,
    })
    .from(issues)
    .innerJoin(issueAnchors, eq(issueAnchors.issueId, issues.id))
    .leftJoin(pages, eq(pages.id, issues.pageId))
    .innerJoin(reviews, eq(reviews.id, issues.reviewId))
    .innerJoin(projectEnvironments, eq(projectEnvironments.id, reviews.environmentId))
    .innerJoin(deployments, eq(deployments.id, reviews.deploymentId))
    .where(and(...conditions))
    .orderBy(issues.number);

  return {
    ok: true,
    meta: {
      pageRoute: route,
      environmentName: rows[0]?.environmentName ?? "",
      versionLabel: rows[0]?.versionLabel ?? "",
    },
    issues: rows.map((row) => {
      const status = row.status as IssueStatus;
      const priority = row.priority as IssuePriority;
      const approved = row.approvedDataAttributes ?? {};
      return {
        id: row.id,
        number: row.number,
        title: deriveIssueDisplayTitle(row.body),
        status,
        statusLabel: ISSUE_STATUS_LABELS[status] ?? status,
        priority,
        priorityLabel: ISSUE_PRIORITY_LABELS[priority] ?? priority,
        assigneeDisplayName: null,
        groupLabel: heatmapLabel(row),
        marker: {
          stableElementId: row.stableElementId,
          approvedDataAttributes: approved,
          accessibleName: approved["aria-label"] ?? null,
          selectedText: row.selectedText,
          pageTitle: row.pageTitle,
          heading: row.pageTitle,
          region: null,
        },
      };
    }),
  };
}

export async function summarizeHeatmapForReview(
  workspaceId: string,
  projectId: string,
  reviewId: string,
) {
  const [review] = await db
    .select({
      environmentName: projectEnvironments.name,
      versionLabel: deployments.identifier,
    })
    .from(reviews)
    .innerJoin(projectEnvironments, eq(projectEnvironments.id, reviews.environmentId))
    .innerJoin(deployments, eq(deployments.id, reviews.deploymentId))
    .where(
      and(
        eq(reviews.id, reviewId),
        eq(reviews.projectId, projectId),
        eq(reviews.workspaceId, workspaceId),
      ),
    )
    .limit(1);
  if (!review) return null;

  const rows = await db
    .select({
      route: sql<string>`coalesce(${issueAnchors.route}, ${pages.normalizedRoute}, '/')`,
      pageTitle: sql<string | null>`coalesce(${issueAnchors.pageTitle}, ${pages.lastKnownTitle})`,
      selectedText: issueAnchors.selectedText,
      approvedDataAttributes: issueAnchors.approvedDataAttributes,
      hasAnchor: sql<boolean>`${issueAnchors.issueId} is not null`,
    })
    .from(issues)
    .leftJoin(issueAnchors, eq(issueAnchors.issueId, issues.id))
    .leftJoin(pages, eq(pages.id, issues.pageId))
    .where(
      and(
        eq(issues.workspaceId, workspaceId),
        eq(issues.projectId, projectId),
        eq(issues.reviewId, reviewId),
        isNull(issues.deletedAt),
        sql`${issues.status}::text in (${sql.join(
          OPEN_ISSUE_STATUSES.map((status) => sql`${status}`),
          sql`, `,
        )})`,
      ),
    )
    .orderBy(desc(issues.updatedAt));

  const byPage = new Map<
    string,
    { route: string; title: string | null; total: number; located: number; labels: Map<string, number> }
  >();
  for (const row of rows) {
    const key = row.route || "/";
    const current = byPage.get(key) ?? {
      route: key,
      title: row.pageTitle,
      total: 0,
      located: 0,
      labels: new Map(),
    };
    current.total += 1;
    if (row.hasAnchor) current.located += 1;
    const label = heatmapLabel({
      selectedText: row.selectedText,
      pageTitle: row.pageTitle,
      approvedDataAttributes: row.approvedDataAttributes,
    });
    current.labels.set(label, (current.labels.get(label) ?? 0) + 1);
    byPage.set(key, current);
  }

  const pagesSummary = [...byPage.values()]
    .sort((a, b) => b.total - a.total)
    .slice(0, 8)
    .map((page) => ({
      route: page.route,
      title: page.title,
      total: page.total,
      located: page.located,
      unresolved: page.total - page.located,
      topLabel:
        [...page.labels.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ??
        "Page area",
    }));

  return {
    environmentName: review.environmentName,
    versionLabel: review.versionLabel,
    pages: pagesSummary,
    total: rows.length,
    located: rows.filter((row) => row.hasAnchor).length,
  };
}
