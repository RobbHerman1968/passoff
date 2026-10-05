import "server-only";

import { and, desc, eq, inArray, sql } from "drizzle-orm";

import { db } from "@/db";
import {
  activityEvents,
  guestIdentities,
  issueAnchors,
  issueComments,
  issueVerifications,
  issues,
  pages,
  reviews,
  users,
} from "@/db/schema";
import {
  ISSUE_EXPORT_MAX,
  exportFilename,
  toCsv,
  toMarkdown,
  type IssueExportMeta,
  type IssueExportRow,
} from "@/lib/issues/export-format";
import {
  assertReviewInWorkspace,
  buildFilterConditions,
} from "@/lib/issues/list";
import { deriveIssueDisplayTitle } from "@/lib/issues/display-title";
import type { IssueListFilters } from "@/lib/issues/schemas";
import type { IssueClosureReason, IssuePriority, IssueStatus } from "@/lib/issues/statuses";
import { issueDetailPath } from "@/lib/issues/url";
import { absoluteUrl } from "@/lib/site";
import { personDisplayName } from "@/lib/users/display-name";
import type { WorkspaceContext } from "@/lib/workspaces/context";

export type IssueExportResult =
  | {
      ok: true;
      filename: string;
      contentType: string;
      body: string;
      count: number;
    }
  | { ok: false; error: "not_found" | "too_large"; count?: number; max?: number };

export async function loadIssuesForExport(
  context: WorkspaceContext,
  projectId: string,
  reviewId: string,
  filters: IssueListFilters,
  includeReplies: boolean,
): Promise<
  | { ok: true; rows: IssueExportRow[]; meta: IssueExportMeta; reviewName: string }
  | { ok: false; error: "not_found" | "too_large"; count?: number }
> {
  const review = await assertReviewInWorkspace(context, projectId, reviewId);
  if (!review) return { ok: false, error: "not_found" };

  const [named] = await db
    .select({ name: reviews.name })
    .from(reviews)
    .where(and(eq(reviews.id, reviewId), eq(reviews.workspaceId, context.workspaceId)))
    .limit(1);
  if (!named) return { ok: false, error: "not_found" };

  const conditions = buildFilterConditions(context, projectId, reviewId, filters);
  const where = and(...conditions);

  const [countRow] = await db
    .select({ total: sql<number>`count(distinct ${issues.id})`.mapWith(Number) })
    .from(issues)
    .leftJoin(issueAnchors, eq(issueAnchors.issueId, issues.id))
    .leftJoin(pages, eq(pages.id, issues.pageId))
    .where(where);

  const total = countRow?.total ?? 0;
  if (total > ISSUE_EXPORT_MAX) {
    return { ok: false, error: "too_large", count: total };
  }

  const authorUser = db
    .select({ id: users.id, name: users.name, email: users.email })
    .from(users)
    .as("export_author_user");
  const assigneeUser = db
    .select({ id: users.id, name: users.name, email: users.email })
    .from(users)
    .as("export_assignee_user");

  const issueRows = await db
    .select({
      id: issues.id,
      number: issues.number,
      body: issues.body,
      status: issues.status,
      closureReason: issues.closureReason,
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
    .orderBy(desc(issues.updatedAt), desc(issues.number));

  const ids = issueRows.map((row) => row.id);
  const replyCounts = new Map<string, number>();
  const replies = new Map<string, IssueExportRow["publicReplies"]>();
  const verifications = new Map<
    string,
    { outcome: string; createdAt: Date }
  >();

  if (ids.length > 0) {
    const countRows = await db
      .select({
        issueId: issueComments.issueId,
        total: sql<number>`count(*)`.mapWith(Number),
      })
      .from(issueComments)
      .where(
        and(
          inArray(issueComments.issueId, ids),
          eq(issueComments.isPrivate, false),
          sql`${issueComments.deletedAt} is null`,
        ),
      )
      .groupBy(issueComments.issueId);
    for (const row of countRows) replyCounts.set(row.issueId, row.total);

    if (includeReplies) {
      const commentAuthor = db
        .select({ id: users.id, name: users.name, email: users.email })
        .from(users)
        .as("export_comment_author");
      const commentRows = await db
        .select({
          issueId: issueComments.issueId,
          body: issueComments.body,
          createdAt: issueComments.createdAt,
          userName: commentAuthor.name,
          userEmail: commentAuthor.email,
          guestName: guestIdentities.name,
        })
        .from(issueComments)
        .leftJoin(commentAuthor, eq(commentAuthor.id, issueComments.authorUserId))
        .leftJoin(guestIdentities, eq(guestIdentities.id, issueComments.authorGuestId))
        .where(
          and(
            inArray(issueComments.issueId, ids),
            eq(issueComments.isPrivate, false),
            sql`${issueComments.deletedAt} is null`,
          ),
        )
        .orderBy(issueComments.createdAt);
      for (const row of commentRows) {
        const list = replies.get(row.issueId) ?? [];
        list.push({
          author: personDisplayName(
            row.userName ?? row.guestName,
            row.userEmail,
          ),
          body: row.body,
          createdAt: row.createdAt,
        });
        replies.set(row.issueId, list);
      }
    }

    const verificationRows = await db
      .select({
        issueId: issueVerifications.issueId,
        outcome: issueVerifications.outcome,
        createdAt: issueVerifications.createdAt,
      })
      .from(issueVerifications)
      .where(inArray(issueVerifications.issueId, ids))
      .orderBy(desc(issueVerifications.createdAt));
    for (const row of verificationRows) {
      if (!verifications.has(row.issueId)) {
        verifications.set(row.issueId, {
          outcome: row.outcome,
          createdAt: row.createdAt,
        });
      }
    }
  }

  const rows: IssueExportRow[] = issueRows.map((row) => {
    const reporter = row.authorGuestName
      ? personDisplayName(row.authorGuestName, row.authorGuestEmail)
      : personDisplayName(row.authorUserName, row.authorUserEmail);
    const verification = verifications.get(row.id);
    return {
      number: row.number,
      title: deriveIssueDisplayTitle(row.body),
      body: row.body,
      status: row.status as IssueStatus,
      closureReason: (row.closureReason as IssueClosureReason | null) ?? null,
      priority: row.priority as IssuePriority,
      assigneeDisplayName: row.assigneeUserId
        ? personDisplayName(row.assigneeName, row.assigneeEmail)
        : "Unassigned",
      reporterDisplayName: reporter,
      pageTitle: row.pageTitle,
      pageUrl: row.pageUrl,
      route: row.pageRoute,
      environmentName: review.environmentName,
      versionLabel: review.versionLabel,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      publicReplyCount: replyCounts.get(row.id) ?? 0,
      publicReplies: replies.get(row.id) ?? [],
      latestVerificationOutcome: verification?.outcome ?? null,
      latestVerificationAt: verification?.createdAt ?? null,
      issueHref: absoluteUrl(issueDetailPath(projectId, reviewId, row.number)),
    };
  });

  const meta: IssueExportMeta = {
    reviewName: named.name,
    environmentName: review.environmentName,
    versionLabel: review.versionLabel,
    exportedAt: new Date(),
    filters,
    includeReplies,
  };

  return { ok: true, rows, meta, reviewName: named.name };
}

export async function buildIssueExport(
  context: WorkspaceContext,
  input: {
    projectId: string;
    reviewId: string;
    filters: IssueListFilters;
    format: "csv" | "md";
    includeReplies: boolean;
  },
): Promise<IssueExportResult> {
  const loaded = await loadIssuesForExport(
    context,
    input.projectId,
    input.reviewId,
    input.filters,
    input.includeReplies && input.format === "md",
  );
  if (!loaded.ok) {
    return loaded.error === "too_large"
      ? {
          ok: false,
          error: "too_large",
          count: loaded.count,
          max: ISSUE_EXPORT_MAX,
        }
      : { ok: false, error: "not_found" };
  }

  const filename = exportFilename(loaded.reviewName, input.format, loaded.meta.exportedAt);
  const body =
    input.format === "csv"
      ? toCsv(loaded.rows)
      : toMarkdown(loaded.meta, loaded.rows);

  await db.insert(activityEvents).values({
    workspaceId: context.workspaceId,
    projectId: input.projectId,
    reviewId: input.reviewId,
    actorUserId: context.userId,
    type: "review.issues_exported",
    data: {
      format: input.format,
      count: loaded.rows.length,
      includeReplies: input.includeReplies && input.format === "md",
    },
  });

  return {
    ok: true,
    filename,
    contentType:
      input.format === "csv"
        ? "text/csv; charset=utf-8"
        : "text/markdown; charset=utf-8",
    body,
    count: loaded.rows.length,
  };
}

export async function countMatchingIssues(
  context: WorkspaceContext,
  projectId: string,
  reviewId: string,
  filters: IssueListFilters,
): Promise<number | null> {
  const review = await assertReviewInWorkspace(context, projectId, reviewId);
  if (!review) return null;
  const where = and(...buildFilterConditions(context, projectId, reviewId, filters));
  const [countRow] = await db
    .select({ total: sql<number>`count(distinct ${issues.id})`.mapWith(Number) })
    .from(issues)
    .leftJoin(issueAnchors, eq(issueAnchors.issueId, issues.id))
    .leftJoin(pages, eq(pages.id, issues.pageId))
    .where(where);
  return countRow?.total ?? 0;
}
