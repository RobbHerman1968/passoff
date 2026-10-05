import type { Metadata } from "next";
import { redirect } from "next/navigation";

import {
  IssueDetailView,
  IssueUnavailableView,
} from "@/components/issues/issue-detail";
import { PageHeader } from "@/components/page-header";
import { PermissionDeniedState } from "@/components/permission-denied-state";
import { getIssueDetailForReview } from "@/lib/issues/list";
import {
  parseIssueNumberParam,
  resolveIssueListReturnHref,
  reviewIssuesPath,
} from "@/lib/issues/url";
import { getReviewForWorkspace } from "@/lib/projects/service";
import { requireWorkspaceContext } from "@/lib/workspaces/context";

type RouteParams = Promise<{
  projectId: string;
  reviewId: string;
  issueNumber: string;
}>;
type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export async function generateMetadata({
  params,
}: {
  params: RouteParams;
}): Promise<Metadata> {
  const { projectId, reviewId, issueNumber: issueNumberRaw } = await params;
  const issueNumber = parseIssueNumberParam(issueNumberRaw);
  const auth = await requireWorkspaceContext();
  if (!auth.ok || !issueNumber) {
    return { title: "Issue" };
  }

  const issue = await getIssueDetailForReview(
    auth.context,
    projectId,
    reviewId,
    issueNumber,
  );
  if (!issue || issue === "unavailable") {
    return { title: "Issue unavailable" };
  }

  return {
    title: `Issue #${issue.number}: ${issue.displayTitle}`,
    description: "Reviewer feedback and captured page context.",
  };
}

export default async function IssueDetailPage({
  params,
  searchParams,
}: {
  params: RouteParams;
  searchParams: SearchParams;
}) {
  const { projectId, reviewId, issueNumber: issueNumberRaw } = await params;
  const issueNumber = parseIssueNumberParam(issueNumberRaw);
  const auth = await requireWorkspaceContext();

  if (!auth.ok) {
    if (auth.reason === "unauthenticated") {
      redirect(
        `/sign-in?callbackUrl=/projects/${projectId}/reviews/${reviewId}/issues/${issueNumberRaw}`,
      );
    }
    redirect("/onboarding");
  }

  const review = await getReviewForWorkspace(auth.context, projectId, reviewId);
  const paramsRecord = await searchParams;
  const backHref = resolveIssueListReturnHref(
    projectId,
    reviewId,
    paramsRecord.return,
  );

  if (!review) {
    return (
      <>
        <PageHeader
          title="Review unavailable"
          description="This review isn’t available in your workspace."
          breadcrumbs={[
            { href: "/dashboard", label: "Projects" },
            { label: "Unavailable" },
          ]}
        />
        <PermissionDeniedState />
      </>
    );
  }

  if (!issueNumber) {
    return (
      <IssueUnavailableView
        projectId={review.projectId}
        projectName={review.projectName}
        reviewId={review.id}
        reviewName={review.name}
        backHref={reviewIssuesPath(review.projectId, review.id)}
      />
    );
  }

  let issue: Awaited<ReturnType<typeof getIssueDetailForReview>>;
  try {
    issue = await getIssueDetailForReview(
      auth.context,
      review.projectId,
      review.id,
      issueNumber,
    );
  } catch {
    return (
      <IssueUnavailableView
        projectId={review.projectId}
        projectName={review.projectName}
        reviewId={review.id}
        reviewName={review.name}
        backHref={backHref}
        issueNumber={issueNumber}
      />
    );
  }

  if (!issue || issue === "unavailable") {
    return (
      <IssueUnavailableView
        projectId={review.projectId}
        projectName={review.projectName}
        reviewId={review.id}
        reviewName={review.name}
        backHref={backHref}
        issueNumber={issueNumber}
      />
    );
  }

  return (
    <IssueDetailView
      issue={issue}
      projectId={review.projectId}
      reviewId={review.id}
      projectName={review.projectName}
      reviewName={review.name}
      backHref={backHref}
    />
  );
}
