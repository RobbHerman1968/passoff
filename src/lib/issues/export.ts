import "server-only";

import { and, desc, eq, inArray, sql } from "drizzle-orm";

import { db } from "@/db";
import {
  behavioralEvidenceSnapshots,
  activityEvents,
  guestIdentities,
  issueAnchors,
  issueComments,
  issueEvidence,
  issueVerifications,
  issues,
  pages,
  reviews,
  users,
  verificationRuns,
  videoAssets,
} from "@/db/schema";
import {
  ISSUE_EXPORT_MAX,
  exportFilename,
  toCsv,
  toMarkdown,
  videoEvidenceExportSummary,
  type IssueExportMeta,
  type IssueExportRow,
} from "@/lib/issues/export-format";
import {
  assertReviewInWorkspace,
  buildFilterConditions,
} from "@/lib/issues/list";
import { listReviewApprovalSummaries } from "@/lib/approvals/requests";
import { approvalStateLabel } from "@/lib/approvals/status";
import { deriveIssueDisplayTitle } from "@/lib/issues/display-title";
import type { IssueListFilters } from "@/lib/issues/schemas";
import type { IssueClosureReason, IssuePriority, IssueStatus } from "@/lib/issues/statuses";
import { issueDetailPath } from "@/lib/issues/url";
import { listLabelsForIssues } from "@/lib/labels/service";
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
        method: issueVerifications.method,
        createdAt: issueVerifications.createdAt,
      })
      .from(issueVerifications)
      .where(inArray(issueVerifications.issueId, ids))
      .orderBy(desc(issueVerifications.createdAt));
    for (const row of verificationRows) {
      if (row.method !== "human") continue;
      if (!verifications.has(row.issueId)) {
        verifications.set(row.issueId, {
          outcome: row.outcome,
          createdAt: row.createdAt,
        });
      }
    }
  }

  const issueLabelMap = await listLabelsForIssues(context, ids);

  const browserCheckSummaries = new Map<string, string>();
  if (ids.length > 0) {
    const runRows = await db
      .select({
        issueId: verificationRuns.issueId,
        overall: verificationRuns.overallResult,
        actualRoute: verificationRuns.actualRoute,
        viewportWidth: verificationRuns.viewportWidth,
        viewportHeight: verificationRuns.viewportHeight,
      })
      .from(verificationRuns)
      .where(
        and(
          inArray(verificationRuns.issueId, ids),
          eq(verificationRuns.workspaceId, context.workspaceId),
        ),
      )
      .orderBy(desc(verificationRuns.createdAt));
    for (const row of runRows) {
      if (browserCheckSummaries.has(row.issueId) || !row.overall) continue;
      const viewport =
        row.viewportWidth && row.viewportHeight
          ? ` at ${row.viewportWidth} × ${row.viewportHeight}`
          : "";
      browserCheckSummaries.set(
        row.issueId,
        `Browser check ${row.overall}${row.actualRoute ? ` on ${row.actualRoute}` : ""}${viewport}.`,
      );
    }
  }

  const evidenceSummaries = new Map<string, string>();
  if (ids.length > 0) {
    const evidenceRows = await db
      .select({
        issueId: behavioralEvidenceSnapshots.issueId,
        payload: behavioralEvidenceSnapshots.payload,
      })
      .from(behavioralEvidenceSnapshots)
      .where(
        and(
          inArray(behavioralEvidenceSnapshots.issueId, ids),
          eq(behavioralEvidenceSnapshots.workspaceId, context.workspaceId),
        ),
      );
    for (const row of evidenceRows) {
      if (!row.issueId) continue;
      const payload = row.payload;
      const summary = `${String(payload.findingType ?? "")} on ${String(payload.route ?? "")} (${String(payload.viewportGroup ?? "")}, ${String(payload.deploymentVersion ?? "unspecified")}): ${Number(payload.metricValue ?? 0).toFixed(3)} of ${Number(payload.eligibleSessionCount ?? 0)} eligible sessions.`;
      const previous = evidenceSummaries.get(row.issueId);
      evidenceSummaries.set(
        row.issueId,
        previous ? `${previous} ${summary}` : summary,
      );
    }
  }

  // Video evidence is mentioned, never linked: playback needs a signed-in person or live review link.
  const videoSummaries = new Map<string, string>();
  if (ids.length > 0) {
    const videoRows = await db
      .select({
        issueId: issueEvidence.issueId,
        durationMs: videoAssets.durationMs,
      })
      .from(videoAssets)
      .innerJoin(
        issueEvidence,
        and(
          eq(issueEvidence.id, videoAssets.evidenceId),
          eq(issueEvidence.workspaceId, videoAssets.workspaceId),
        ),
      )
      .where(
        and(
          inArray(issueEvidence.issueId, ids),
          eq(videoAssets.workspaceId, context.workspaceId),
          eq(videoAssets.lifecycle, "current"),
          eq(videoAssets.processingStatus, "ready"),
        ),
      );
    for (const row of videoRows) {
      videoSummaries.set(
        row.issueId,
        videoEvidenceExportSummary(row.durationMs == null ? null : row.durationMs / 1_000),
      );
    }
  }

  // Approval is review-level. A failure here must not block the handoff export.
  const approvalSummary = (
    await listReviewApprovalSummaries(context.workspaceId, [reviewId]).catch(
      () => new Map(),
    )
  ).get(reviewId);
  const approvalStatus = approvalSummary
    ? approvalStateLabel({
        state: approvalSummary.visibleState,
        currentVersionLabel: approvalSummary.currentVersionLabel,
        approvedVersionLabel: approvalSummary.approvedVersionLabel,
      })
    : "";

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
      labels: (issueLabelMap.get(row.id) ?? []).map((label) => label.name),
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
      latestBrowserCheckSummary: browserCheckSummaries.get(row.id) ?? "",
      behavioralEvidenceSummary: evidenceSummaries.get(row.id) ?? "",
      videoEvidenceSummary: videoSummaries.get(row.id) ?? "",
      issueHref: absoluteUrl(issueDetailPath(projectId, reviewId, row.number)),
      approvalStatus,
    };
  });

  const meta: IssueExportMeta = {
    reviewName: named.name,
    environmentName: review.environmentName,
    versionLabel: review.versionLabel,
    exportedAt: new Date(),
    filters,
    includeReplies,
    approval: approvalSummary
      ? {
          statusLabel: approvalStatus,
          decidedBy: approvalSummary.approvedByDisplayName,
          decidedAt: approvalSummary.approvedAt ? new Date(approvalSummary.approvedAt) : null,
          note: approvalSummary.decisionNote,
          historical: approvalSummary.visibleState === "historical_approval",
        }
      : null,
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
