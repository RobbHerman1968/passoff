import "server-only";

import {
  and,
  asc,
  desc,
  eq,
  ilike,
  isNotNull,
  isNull,
  or,
  sql,
  type SQL,
} from "drizzle-orm";

import { db } from "@/db";
import {
  deployments,
  guestIdentities,
  issueAnchors,
  issueEvidence,
  issues,
  pages,
  projectEnvironments,
  projects,
  reviews,
  users,
  workspaceMemberships,
} from "@/db/schema";
import { playableVideoExistsSql } from "@/lib/video/has-video";
import { deriveIssueDisplayTitle } from "@/lib/issues/display-title";
import {
  ISSUE_LIST_PAGE_SIZE,
  type IssueListFilters,
  type IssueShowFilter,
} from "@/lib/issues/schemas";
import {
  parseScreenshotAnnotation,
  type ScreenshotAnnotation,
} from "@/lib/issues/screenshot-annotation";
import {
  OPEN_ISSUE_STATUSES,
  type IssuePriority,
  type IssueStatus,
} from "@/lib/issues/statuses";
import { personDisplayName } from "@/lib/users/display-name";
import type { WorkspaceContext } from "@/lib/workspaces/context";

export type IssueListItem = {
  id: string;
  number: number;
  body: string;
  displayTitle: string;
  status: IssueStatus;
  priority: IssuePriority;
  pageRoute: string | null;
  pageTitle: string | null;
  reporterDisplayName: string;
  assigneeDisplayName: string;
  assigneeUserId: string | null;
  hasScreenshotEvidence: boolean;
  screenshotCaptureStatus: "pending" | "ready" | "unavailable" | "failed" | null;
  hasVideoEvidence: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export type IssueListFacetAssignee = {
  userId: string;
  displayName: string;
};

export type IssueListFacets = {
  priorities: IssuePriority[];
  pages: Array<{ route: string; title: string | null }>;
  assignees: IssueListFacetAssignee[];
  hasUnassigned: boolean;
  hasVideo: boolean;
};

export type IssueListResult = {
  items: IssueListItem[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
  facets: IssueListFacets;
};

export type IssueDetail = IssueListItem & {
  version: number;
  pageUrl: string | null;
  environmentName: string;
  versionLabel: string;
  screenshotCaptureMethod:
    | "browser_reconstruction"
    | "worker_capture"
    | "manual_attachment"
    | "host_upload"
    | null;
  /** Normalized annotation for the selected element, when recorded. */
  screenshotAnnotation: ScreenshotAnnotation | null;
};

/** @deprecated Use IssueDetail. Kept for transitional imports. */
export type IssuePreview = IssueDetail;

export type IssueScreenshotPayload =
  | {
      ok: true;
      bytes: Buffer;
      mimeType: "image/png";
      captureMethod: "browser_reconstruction" | "worker_capture" | "manual_attachment" | "host_upload";
    }
  | {
      ok: false;
      status: "pending" | "unavailable" | "failed" | "not_found";
    };

function displayName(name: string | null | undefined, email: string | null | undefined) {
  return personDisplayName(name, email);
}

function escapeLike(value: string) {
  return value.replace(/[%_\\]/g, "\\$&");
}

function showStatusCondition(show: IssueShowFilter): SQL | undefined {
  if (show === "active") {
    return sql`${issues.status}::text in (${sql.join(
      OPEN_ISSUE_STATUSES.map((status) => sql`${status}`),
      sql`, `,
    )})`;
  }
  if (show === "verified") {
    return eq(issues.status, "verified");
  }
  if (show === "closed") {
    return eq(issues.status, "closed");
  }
  return undefined;
}

export async function assertReviewInWorkspace(
  context: WorkspaceContext,
  projectId: string,
  reviewId: string,
): Promise<{ id: string; environmentName: string; versionLabel: string } | null> {
  const [row] = await db
    .select({
      id: reviews.id,
      environmentName: projectEnvironments.name,
      versionLabel: deployments.identifier,
    })
    .from(reviews)
    .innerJoin(
      projects,
      and(
        eq(projects.id, reviews.projectId),
        eq(projects.workspaceId, context.workspaceId),
        isNull(projects.deletedAt),
      ),
    )
    .innerJoin(
      projectEnvironments,
      and(
        eq(projectEnvironments.id, reviews.environmentId),
        eq(projectEnvironments.workspaceId, context.workspaceId),
      ),
    )
    .innerJoin(
      deployments,
      and(
        eq(deployments.id, reviews.deploymentId),
        eq(deployments.workspaceId, context.workspaceId),
      ),
    )
    .where(
      and(
        eq(reviews.id, reviewId),
        eq(reviews.projectId, projectId),
        eq(reviews.workspaceId, context.workspaceId),
      ),
    )
    .limit(1);

  return row ?? null;
}

function scopedIssueConditions(
  context: WorkspaceContext,
  projectId: string,
  reviewId: string,
) {
  return [
    eq(issues.workspaceId, context.workspaceId),
    eq(issues.projectId, projectId),
    eq(issues.reviewId, reviewId),
    isNull(issues.deletedAt),
  ];
}

export function buildFilterConditions(
  context: WorkspaceContext,
  projectId: string,
  reviewId: string,
  filters: IssueListFilters,
): SQL[] {
  const conditions: SQL[] = scopedIssueConditions(context, projectId, reviewId);

  const statusCondition = showStatusCondition(filters.show);
  if (statusCondition) {
    conditions.push(statusCondition);
  }

  if (filters.priority) {
    conditions.push(eq(issues.priority, filters.priority));
  }

  if (filters.assignee === "unassigned") {
    conditions.push(isNull(issues.assigneeUserId));
  } else if (filters.assignee) {
    conditions.push(eq(issues.assigneeUserId, filters.assignee));
  }

  if (filters.page) {
    conditions.push(
      or(
        eq(issueAnchors.route, filters.page),
        eq(pages.normalizedRoute, filters.page),
      )!,
    );
  }

  if (filters.video) {
    conditions.push(playableVideoExistsSql(context.workspaceId));
  }

  const q = filters.q.trim();
  if (q) {
    const pattern = `%${escapeLike(q)}%`;
    const searchParts: SQL[] = [
      ilike(issues.body, pattern),
      ilike(issueAnchors.pageTitle, pattern),
      ilike(issueAnchors.route, pattern),
      ilike(issueAnchors.pageUrl, pattern),
      ilike(pages.normalizedRoute, pattern),
      ilike(pages.lastKnownTitle, pattern),
    ];
    if (/^\d+$/.test(q)) {
      searchParts.push(eq(issues.number, Number(q)));
    }
    conditions.push(or(...searchParts)!);
  }

  return conditions;
}

async function loadFacets(
  context: WorkspaceContext,
  projectId: string,
  reviewId: string,
): Promise<IssueListFacets> {
  const base = and(...scopedIssueConditions(context, projectId, reviewId));

  const priorityRows = await db
    .selectDistinct({ priority: issues.priority })
    .from(issues)
    .where(base)
    .orderBy(asc(issues.priority));

  const pageRows = await db
    .selectDistinct({
      route: sql<string>`coalesce(${issueAnchors.route}, ${pages.normalizedRoute})`,
      title: sql<string | null>`coalesce(${issueAnchors.pageTitle}, ${pages.lastKnownTitle})`,
    })
    .from(issues)
    .leftJoin(issueAnchors, eq(issueAnchors.issueId, issues.id))
    .leftJoin(pages, eq(pages.id, issues.pageId))
    .where(
      and(
        base,
        sql`coalesce(${issueAnchors.route}, ${pages.normalizedRoute}) is not null`,
      ),
    )
    .orderBy(asc(sql`coalesce(${issueAnchors.route}, ${pages.normalizedRoute})`));

  const assigneeRows = await db
    .selectDistinct({
      userId: users.id,
      name: users.name,
      email: users.email,
    })
    .from(issues)
    .innerJoin(users, eq(users.id, issues.assigneeUserId))
    .innerJoin(
      workspaceMemberships,
      and(
        eq(workspaceMemberships.userId, users.id),
        eq(workspaceMemberships.workspaceId, context.workspaceId),
        eq(workspaceMemberships.status, "active"),
      ),
    )
    .where(and(base, isNotNull(issues.assigneeUserId)))
    .orderBy(asc(users.name), asc(users.email));

  const [unassignedRow] = await db
    .select({ count: sql<number>`count(*)`.mapWith(Number) })
    .from(issues)
    .where(and(base, isNull(issues.assigneeUserId)));

  const [videoRow] = await db
    .select({ count: sql<number>`count(*)`.mapWith(Number) })
    .from(issues)
    .where(and(base, playableVideoExistsSql(context.workspaceId)));

  return {
    priorities: priorityRows.map((row) => row.priority as IssuePriority),
    pages: pageRows
      .filter((row): row is { route: string; title: string | null } => Boolean(row.route))
      .map((row) => ({ route: row.route, title: row.title })),
    assignees: assigneeRows.map((row) => ({
      userId: row.userId,
      displayName: displayName(row.name, row.email),
    })),
    hasUnassigned: (unassignedRow?.count ?? 0) > 0,
    hasVideo: (videoRow?.count ?? 0) > 0,
  };
}

function mapListRow(row: {
  id: string;
  number: number;
  body: string;
  status: IssueStatus;
  priority: IssuePriority;
  pageRoute: string | null;
  pageTitle: string | null;
  authorUserName: string | null;
  authorUserEmail: string | null;
  authorGuestName: string | null;
  authorGuestEmail: string | null;
  assigneeUserId: string | null;
  assigneeName: string | null;
  assigneeEmail: string | null;
  screenshotCaptureStatus: "pending" | "ready" | "unavailable" | "failed" | null;
  hasVideoEvidence: boolean;
  createdAt: Date;
  updatedAt: Date;
}): IssueListItem {
  const reporterDisplayName = row.authorGuestName
    ? displayName(row.authorGuestName, row.authorGuestEmail)
    : displayName(row.authorUserName, row.authorUserEmail);

  return {
    id: row.id,
    number: row.number,
    body: row.body,
    displayTitle: deriveIssueDisplayTitle(row.body),
    status: row.status,
    priority: row.priority,
    pageRoute: row.pageRoute,
    pageTitle: row.pageTitle,
    reporterDisplayName,
    assigneeDisplayName: row.assigneeUserId
      ? displayName(row.assigneeName, row.assigneeEmail)
      : "Unassigned",
    assigneeUserId: row.assigneeUserId,
    hasScreenshotEvidence: row.screenshotCaptureStatus !== null,
    screenshotCaptureStatus: row.screenshotCaptureStatus,
    hasVideoEvidence: row.hasVideoEvidence,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function listIssuesForReview(
  context: WorkspaceContext,
  projectId: string,
  reviewId: string,
  filters: IssueListFilters,
): Promise<IssueListResult | null> {
  const review = await assertReviewInWorkspace(context, projectId, reviewId);
  if (!review) return null;

  const conditions = buildFilterConditions(context, projectId, reviewId, filters);
  const where = and(...conditions);

  const [countRow] = await db
    .select({ total: sql<number>`count(distinct ${issues.id})`.mapWith(Number) })
    .from(issues)
    .leftJoin(issueAnchors, eq(issueAnchors.issueId, issues.id))
    .leftJoin(pages, eq(pages.id, issues.pageId))
    .where(where);

  const total = countRow?.total ?? 0;
  const pageSize = ISSUE_LIST_PAGE_SIZE;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(filters.p, pageCount);
  const offset = (page - 1) * pageSize;

  const authorUser = db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
    })
    .from(users)
    .as("author_user");

  const assigneeUser = db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
    })
    .from(users)
    .as("assignee_user");

  const rows = await db
    .select({
      id: issues.id,
      number: issues.number,
      body: issues.body,
      status: issues.status,
      priority: issues.priority,
      pageRoute: sql<string | null>`coalesce(${issueAnchors.route}, ${pages.normalizedRoute})`,
      pageTitle: sql<string | null>`coalesce(${issueAnchors.pageTitle}, ${pages.lastKnownTitle})`,
      authorUserName: authorUser.name,
      authorUserEmail: authorUser.email,
      authorGuestName: guestIdentities.name,
      authorGuestEmail: guestIdentities.email,
      assigneeUserId: issues.assigneeUserId,
      assigneeName: assigneeUser.name,
      assigneeEmail: assigneeUser.email,
      screenshotCaptureStatus: sql<
        "pending" | "ready" | "unavailable" | "failed" | null
      >`(
        select ie.capture_status
        from issue_evidence ie
        where ie.issue_id = ${issues.id}
          and ie.workspace_id = ${context.workspaceId}
          and ie.kind = 'screenshot'
        order by ie.created_at desc
        limit 1
      )`,
      hasVideoEvidence: playableVideoExistsSql(context.workspaceId),
      createdAt: issues.createdAt,
      updatedAt: issues.updatedAt,
    })
    .from(issues)
    .leftJoin(issueAnchors, eq(issueAnchors.issueId, issues.id))
    .leftJoin(pages, eq(pages.id, issues.pageId))
    .leftJoin(authorUser, eq(authorUser.id, issues.authorUserId))
    .leftJoin(guestIdentities, eq(guestIdentities.id, issues.authorGuestId))
    .leftJoin(assigneeUser, eq(assigneeUser.id, issues.assigneeUserId))
    .where(where)
    .orderBy(desc(issues.updatedAt), desc(issues.number))
    .limit(pageSize)
    .offset(offset);

  const facets = await loadFacets(context, projectId, reviewId);

  return {
    items: rows.map((row) =>
      mapListRow({
        ...row,
        status: row.status as IssueStatus,
        priority: row.priority as IssuePriority,
      }),
    ),
    total,
    page,
    pageSize,
    pageCount,
    facets,
  };
}

export async function getIssueDetailForReview(
  context: WorkspaceContext,
  projectId: string,
  reviewId: string,
  issueNumber: number,
): Promise<IssueDetail | null | "unavailable"> {
  const review = await assertReviewInWorkspace(context, projectId, reviewId);
  if (!review) return null;

  const authorUser = db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
    })
    .from(users)
    .as("detail_author_user");

  const assigneeUser = db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
    })
    .from(users)
    .as("detail_assignee_user");

  const [row] = await db
    .select({
      id: issues.id,
      number: issues.number,
      body: issues.body,
      status: issues.status,
      priority: issues.priority,
      pageRoute: sql<string | null>`coalesce(${issueAnchors.route}, ${pages.normalizedRoute})`,
      pageTitle: sql<string | null>`coalesce(${issueAnchors.pageTitle}, ${pages.lastKnownTitle})`,
      pageUrl: issueAnchors.pageUrl,
      authorUserName: authorUser.name,
      authorUserEmail: authorUser.email,
      authorGuestName: guestIdentities.name,
      authorGuestEmail: guestIdentities.email,
      assigneeUserId: issues.assigneeUserId,
      assigneeName: assigneeUser.name,
      assigneeEmail: assigneeUser.email,
      screenshotCaptureStatus: sql<
        "pending" | "ready" | "unavailable" | "failed" | null
      >`(
        select ie.capture_status
        from issue_evidence ie
        where ie.issue_id = ${issues.id}
          and ie.workspace_id = ${context.workspaceId}
          and ie.kind = 'screenshot'
        order by ie.created_at desc
        limit 1
      )`,
      screenshotCaptureMethod: sql<
        | "browser_reconstruction"
        | "worker_capture"
        | "manual_attachment"
        | "host_upload"
        | null
      >`(
        select ie.capture_method
        from issue_evidence ie
        where ie.issue_id = ${issues.id}
          and ie.workspace_id = ${context.workspaceId}
          and ie.kind = 'screenshot'
        order by ie.created_at desc
        limit 1
      )`,
      screenshotAnnotationRaw: sql<unknown>`(
        select ie.sanitized_context -> 'annotation'
        from issue_evidence ie
        where ie.issue_id = ${issues.id}
          and ie.workspace_id = ${context.workspaceId}
          and ie.kind = 'screenshot'
        order by ie.created_at desc
        limit 1
      )`,
      hasVideoEvidence: playableVideoExistsSql(context.workspaceId),
      createdAt: issues.createdAt,
      updatedAt: issues.updatedAt,
      version: issues.version,
    })
    .from(issues)
    .leftJoin(issueAnchors, eq(issueAnchors.issueId, issues.id))
    .leftJoin(pages, eq(pages.id, issues.pageId))
    .leftJoin(authorUser, eq(authorUser.id, issues.authorUserId))
    .leftJoin(guestIdentities, eq(guestIdentities.id, issues.authorGuestId))
    .leftJoin(assigneeUser, eq(assigneeUser.id, issues.assigneeUserId))
    .where(
      and(
        ...scopedIssueConditions(context, projectId, reviewId),
        eq(issues.number, issueNumber),
      ),
    )
    .limit(1);

  if (!row) {
    return "unavailable";
  }

  return {
    ...mapListRow({
      ...row,
      status: row.status as IssueStatus,
      priority: row.priority as IssuePriority,
    }),
    version: row.version,
    pageUrl: row.pageUrl,
    environmentName: review.environmentName,
    versionLabel: review.versionLabel,
    screenshotCaptureMethod: row.screenshotCaptureMethod,
    // Re-validate stored annotation; never expose pngBase64 or storage keys.
    screenshotAnnotation: parseScreenshotAnnotation(row.screenshotAnnotationRaw),
  };
}

/** @deprecated Use getIssueDetailForReview. */
export const getIssuePreviewForReview = getIssueDetailForReview;

export async function getIssueScreenshotForReview(
  context: WorkspaceContext,
  projectId: string,
  reviewId: string,
  issueNumber: number,
): Promise<IssueScreenshotPayload> {
  const review = await assertReviewInWorkspace(context, projectId, reviewId);
  if (!review) {
    return { ok: false, status: "not_found" };
  }

  const [row] = await db
    .select({
      captureStatus: issueEvidence.captureStatus,
      captureMethod: issueEvidence.captureMethod,
      sanitizedContext: issueEvidence.sanitizedContext,
    })
    .from(issueEvidence)
    .innerJoin(
      issues,
      and(
        eq(issues.id, issueEvidence.issueId),
        eq(issues.workspaceId, context.workspaceId),
        eq(issues.projectId, projectId),
        eq(issues.reviewId, reviewId),
        eq(issues.number, issueNumber),
        isNull(issues.deletedAt),
      ),
    )
    .where(
      and(
        eq(issueEvidence.workspaceId, context.workspaceId),
        eq(issueEvidence.kind, "screenshot"),
      ),
    )
    .orderBy(desc(issueEvidence.createdAt))
    .limit(1);

  if (!row) {
    return { ok: false, status: "not_found" };
  }

  if (row.captureStatus === "pending") {
    return { ok: false, status: "pending" };
  }
  if (row.captureStatus === "unavailable") {
    return { ok: false, status: "unavailable" };
  }
  if (row.captureStatus === "failed") {
    return { ok: false, status: "failed" };
  }

  const pngBase64 =
    typeof row.sanitizedContext?.pngBase64 === "string"
      ? row.sanitizedContext.pngBase64
      : null;

  if (!pngBase64) {
    return { ok: false, status: "unavailable" };
  }

  try {
    const bytes = Buffer.from(pngBase64, "base64");
    // PNG magic number
    if (
      bytes.length < 8 ||
      bytes[0] !== 0x89 ||
      bytes[1] !== 0x50 ||
      bytes[2] !== 0x4e ||
      bytes[3] !== 0x47
    ) {
      return { ok: false, status: "unavailable" };
    }

    return {
      ok: true,
      bytes,
      mimeType: "image/png",
      captureMethod: row.captureMethod,
    };
  } catch {
    return { ok: false, status: "unavailable" };
  }
}
