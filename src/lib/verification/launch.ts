import "server-only";

import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import {
  deployments,
  issueAnchors,
  issues,
  projectEnvironments,
  reviews,
} from "@/db/schema";
import { deriveIssueDisplayTitle } from "@/lib/issues/display-title";
import type { IssueStatus } from "@/lib/issues/statuses";
import { CHECK_KIND_LABELS, failureCopy } from "@/lib/verification/copy";
import { checksUsefulForStatus } from "@/lib/verification/eligibility";
import type { WorkspaceContext } from "@/lib/workspaces/context";

export type VerificationLaunchContext = {
  eligible: boolean;
  blocker: { title: string; next: string } | null;
  issueNumber: number;
  issueTitle: string;
  environmentName: string;
  versionLabel: string;
  pageRoute: string | null;
  pageUrl: string | null;
  viewportWidth: number | null;
  viewportHeight: number | null;
  matchConfidence: string | null;
  availableChecks: Array<{ kind: string; label: string }>;
  namedHooks: string[];
};

export async function getVerificationLaunchContext(
  context: WorkspaceContext,
  projectId: string,
  reviewId: string,
  issueNumber: number,
): Promise<VerificationLaunchContext | null> {
  const [row] = await db
    .select({
      body: issues.body,
      status: issues.status,
      pageUrl: issueAnchors.pageUrl,
      pageRoute: issueAnchors.route,
      matchConfidence: issueAnchors.matchConfidence,
      viewportWidth: issueAnchors.viewportWidth,
      viewportHeight: issueAnchors.viewportHeight,
      envName: projectEnvironments.name,
      envEnabled: projectEnvironments.isEnabled,
      envVerifiedAt: projectEnvironments.verifiedAt,
      envLastSeenAt: projectEnvironments.lastSeenAt,
      hookAllowlist: projectEnvironments.verificationHookAllowlist,
      versionLabel: deployments.identifier,
      reviewDeploymentId: reviews.deploymentId,
    })
    .from(issues)
    .innerJoin(
      reviews,
      and(eq(reviews.id, issues.reviewId), eq(reviews.workspaceId, context.workspaceId)),
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
    .leftJoin(issueAnchors, eq(issueAnchors.issueId, issues.id))
    .where(
      and(
        eq(issues.workspaceId, context.workspaceId),
        eq(issues.projectId, projectId),
        eq(issues.reviewId, reviewId),
        eq(issues.number, issueNumber),
      ),
    )
    .limit(1);

  if (!row) return null;

  let blocker: { title: string; next: string } | null = null;
  if (!checksUsefulForStatus(row.status as IssueStatus)) {
    blocker = {
      title: "This issue isn’t in a state where checks are useful.",
      next: "Reopen the issue, or record a manual verification instead.",
    };
  } else if (!row.pageUrl && !row.pageRoute) {
    blocker = {
      title: "This issue isn’t linked to a place on the website.",
      next: "Relink the issue, then run the checks.",
    };
  } else if (!row.envEnabled) {
    blocker = failureCopy("installation_disabled");
  } else if (!row.envVerifiedAt && !row.envLastSeenAt) {
    blocker = failureCopy("sdk_missing");
  } else if (!row.reviewDeploymentId) {
    blocker = {
      title: "A recorded deployment is needed before checks can run.",
      next: "Record a deployment, then try again.",
    };
  }

  const namedHooks = (row.hookAllowlist ?? []).filter(Boolean);
  const availableChecks = [
    { kind: "element_visibility", label: CHECK_KIND_LABELS.element_visibility },
    { kind: "bounding_box_overlap", label: CHECK_KIND_LABELS.bounding_box_overlap },
    ...(namedHooks.length > 0
      ? [{ kind: "named_test_hook", label: CHECK_KIND_LABELS.named_test_hook }]
      : []),
  ];

  return {
    eligible: blocker === null,
    blocker,
    issueNumber,
    issueTitle: deriveIssueDisplayTitle(row.body),
    environmentName: row.envName,
    versionLabel: row.versionLabel,
    pageRoute: row.pageRoute,
    pageUrl: row.pageUrl,
    viewportWidth: row.viewportWidth,
    viewportHeight: row.viewportHeight,
    matchConfidence: row.matchConfidence,
    availableChecks,
    namedHooks,
  };
}
