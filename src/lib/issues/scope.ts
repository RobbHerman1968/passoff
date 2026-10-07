import "server-only";

import { and, eq, isNull } from "drizzle-orm";

import { db } from "@/db";
import { issues, projects, reviews } from "@/db/schema";

export type IssueScope = {
  id: string;
  workspaceId: string;
  projectId: string;
  reviewId: string;
  number: number;
};

export type IssueScopeInput = {
  projectId: string;
  reviewId: string;
  issueNumber: number;
};

/**
 * Resolve an issue only when it belongs to the signed-in workspace, the named
 * project, and the named review. Soft-deleted issues and projects never resolve.
 */
export async function resolveIssueScope(
  executor: Pick<typeof db, "select">,
  workspaceId: string,
  input: IssueScopeInput,
): Promise<IssueScope | null> {
  const [row] = await executor
    .select({
      id: issues.id,
      workspaceId: issues.workspaceId,
      projectId: issues.projectId,
      reviewId: issues.reviewId,
      number: issues.number,
    })
    .from(issues)
    .innerJoin(
      reviews,
      and(
        eq(reviews.id, issues.reviewId),
        eq(reviews.workspaceId, issues.workspaceId),
        eq(reviews.projectId, issues.projectId),
      ),
    )
    .innerJoin(
      projects,
      and(
        eq(projects.id, issues.projectId),
        eq(projects.workspaceId, issues.workspaceId),
        isNull(projects.deletedAt),
      ),
    )
    .where(
      and(
        eq(issues.workspaceId, workspaceId),
        eq(issues.projectId, input.projectId),
        eq(issues.reviewId, input.reviewId),
        eq(issues.number, input.issueNumber),
        isNull(issues.deletedAt),
      ),
    )
    .limit(1);
  return row ?? null;
}
