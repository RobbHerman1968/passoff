import "server-only";

import { and, desc, eq, isNull } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import { db } from "@/db";
import { assets, issues, projects, reviews, users, videoAssets } from "@/db/schema";
import { resolveIssueScope, type IssueScopeInput } from "@/lib/issues/scope";
import { canMutateProjects } from "@/lib/projects/permissions";
import type { IssueVideoView } from "@/lib/video/states";
import { getVideoUsageView, resolveWorkspaceVideoLimits } from "@/lib/video/usage";
import { buildIssueVideoView, type VideoRowForView } from "@/lib/video/view-builder";
import type { WorkspaceContext } from "@/lib/workspaces/context";
import { personDisplayName } from "@/lib/users/display-name";

type Executor = Pick<typeof db, "select">;

export type VideoIssueState = {
  issueId: string;
  issueNumber: number;
  projectId: string;
  reviewId: string;
  issueClosed: boolean;
  archived: boolean;
};

/** Issue, review, and project state that decides whether video can change. */
export async function loadVideoIssueState(
  executor: Executor,
  workspaceId: string,
  input: IssueScopeInput,
): Promise<VideoIssueState | null> {
  const scope = await resolveIssueScope(executor, workspaceId, input);
  if (!scope) return null;
  const [row] = await executor
    .select({
      status: issues.status,
      reviewArchivedAt: reviews.archivedAt,
      projectStatus: projects.status,
    })
    .from(issues)
    .innerJoin(reviews, eq(reviews.id, issues.reviewId))
    .innerJoin(projects, eq(projects.id, issues.projectId))
    .where(and(eq(issues.id, scope.id), eq(issues.workspaceId, workspaceId)))
    .limit(1);
  if (!row) return null;
  return {
    issueId: scope.id,
    issueNumber: scope.number,
    projectId: scope.projectId,
    reviewId: scope.reviewId,
    issueClosed: row.status === "closed",
    archived: Boolean(row.reviewArchivedAt) || row.projectStatus === "archived",
  };
}

async function loadRows(
  executor: Executor,
  workspaceId: string,
  issueId: string,
): Promise<VideoRowForView[]> {
  const uploader = alias(users, "video_uploader");
  const remover = alias(users, "video_remover");
  const rows = await executor
    .select({
      id: videoAssets.id,
      lifecycle: videoAssets.lifecycle,
      processingStatus: videoAssets.processingStatus,
      failureReason: videoAssets.failureReason,
      durationMs: videoAssets.durationMs,
      createdAt: videoAssets.createdAt,
      removedAt: videoAssets.removedAt,
      removalReason: videoAssets.removalReason,
      providerDeletedAt: videoAssets.providerDeletedAt,
      retentionEndsAt: videoAssets.retentionEndsAt,
      uploaderName: uploader.name,
      uploaderEmail: uploader.email,
      removerName: remover.name,
      removerEmail: remover.email,
    })
    .from(videoAssets)
    .leftJoin(assets, eq(assets.id, videoAssets.originalAssetId))
    .leftJoin(uploader, eq(uploader.id, assets.uploadedByUserId))
    .leftJoin(remover, eq(remover.id, videoAssets.removedByUserId))
    .where(and(eq(videoAssets.workspaceId, workspaceId), eq(videoAssets.issueId, issueId)))
    .orderBy(desc(videoAssets.createdAt))
    .limit(12);

  return rows.map((row) => ({
    id: row.id,
    lifecycle: row.lifecycle,
    processingStatus: row.processingStatus,
    failureReason: row.failureReason,
    durationMs: row.durationMs,
    createdAt: row.createdAt,
    removedAt: row.removedAt,
    removalReason: row.removalReason,
    providerDeletedAt: row.providerDeletedAt,
    retentionEndsAt: row.retentionEndsAt,
    uploadedByName: row.uploaderName || row.uploaderEmail
      ? personDisplayName(row.uploaderName, row.uploaderEmail)
      : null,
    removedByName: row.removerName || row.removerEmail
      ? personDisplayName(row.removerName, row.removerEmail)
      : null,
  }));
}

export async function getIssueVideoView(
  context: WorkspaceContext,
  input: IssueScopeInput,
): Promise<IssueVideoView | null> {
  const state = await loadVideoIssueState(db, context.workspaceId, input);
  if (!state) return null;
  return getIssueVideoViewForState(context, state);
}

export async function getIssueVideoViewForState(
  context: WorkspaceContext,
  state: VideoIssueState,
): Promise<IssueVideoView> {
  const [rows, usage, limits] = await Promise.all([
    loadRows(db, context.workspaceId, state.issueId),
    getVideoUsageView(db, context.workspaceId),
    resolveWorkspaceVideoLimits(db, context.workspaceId),
  ]);
  return buildIssueVideoView({
    issueId: state.issueId,
    rows,
    issueClosed: state.issueClosed,
    archived: state.archived,
    canManage: canMutateProjects(context),
    usage,
    limitsApproved: limits.limits != null,
  });
}

/** Same as the issue view, found by the issue's id. Used by the status check. */
export async function getIssueVideoViewById(
  context: WorkspaceContext,
  issueId: string,
): Promise<IssueVideoView | null> {
  const [issue] = await db
    .select({
      number: issues.number,
      projectId: issues.projectId,
      reviewId: issues.reviewId,
    })
    .from(issues)
    .where(
      and(
        eq(issues.id, issueId),
        eq(issues.workspaceId, context.workspaceId),
        isNull(issues.deletedAt),
      ),
    )
    .limit(1);
  if (!issue) return null;
  return getIssueVideoView(context, {
    projectId: issue.projectId,
    reviewId: issue.reviewId,
    issueNumber: issue.number,
  });
}
