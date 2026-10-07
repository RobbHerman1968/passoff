import type { Metadata } from "next";
import { redirect } from "next/navigation";

import {
  IssueDetailView,
  IssueUnavailableView,
} from "@/components/issues/issue-detail";
import { PageHeader } from "@/components/page-header";
import { PermissionDeniedState } from "@/components/permission-denied-state";
import { listIssueComments } from "@/lib/comments/service";
import type { IssueCommentView } from "@/lib/comments/types";
import type { IssueHistoryEvent } from "@/lib/issues/history";
import { getIssueDetailForReview } from "@/lib/issues/list";
import {
  parseIssueNumberParam,
  resolveIssueListReturnHref,
  reviewIssuesPath,
} from "@/lib/issues/url";
import {
  listAssignableMembers,
  listIssueHistory,
} from "@/lib/issues/triage";
import { getReviewForWorkspace } from "@/lib/projects/service";
import {
  listIssueBehavioralEvidence,
  listIssueComparisons,
} from "@/lib/findings/service";
import {
  listAttachableAssets,
  listIssueAttachments,
} from "@/lib/attachments/service";
import { listIssueLabels, listWorkspaceLabels } from "@/lib/labels/service";
import { canMutateProjects } from "@/lib/projects/permissions";
import { listVideoNotesForMember } from "@/lib/video/annotations/service";
import { getIssueVideoView } from "@/lib/video/issue-video";
import { getVerificationLaunchContext } from "@/lib/verification/launch";
import { listVerificationRunsForIssue } from "@/lib/verification/query";
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

  const members = await listAssignableMembers(auth.context);
  let history: IssueHistoryEvent[] = [];
  let historyError: string | null = null;
  try {
    const loaded = await listIssueHistory(auth.context, {
      projectId: review.projectId,
      reviewId: review.id,
      issueNumber,
    });
    if (!loaded) {
      historyError = "We couldn’t load history. Try again.";
    } else {
      history = loaded;
    }
  } catch {
    historyError = "We couldn’t load history. Try again.";
  }

  let comments: IssueCommentView[] = [];
  let commentsError: string | null = null;
  try {
    const loaded = await listIssueComments(auth.context, {
      projectId: review.projectId,
      reviewId: review.id,
      issueNumber,
      includePrivate: true,
    });
    if (loaded.ok) {
      comments = loaded.comments;
    } else {
      commentsError = "We couldn’t load the discussion. Reload to try again.";
    }
  } catch {
    commentsError = "We couldn’t load the discussion. Reload to try again.";
  }

  const issueScope = {
    projectId: review.projectId,
    reviewId: review.id,
    issueNumber,
  };
  const [labels, workspaceLabels, attachments, attachableFiles, videoView, videoNotes] = await Promise.all([
    listIssueLabels(auth.context, issueScope).catch(() => null),
    listWorkspaceLabels(auth.context).catch(() => []),
    listIssueAttachments(auth.context, issueScope).catch(() => null),
    listAttachableAssets(auth.context, issueScope).catch(() => null),
    getIssueVideoView(auth.context, issueScope).catch(() => null),
    listVideoNotesForMember(auth.context, issueScope).catch(() => null),
  ]);

  return (
    <IssueDetailView
      issue={issue}
      labels={labels ?? []}
      workspaceLabels={workspaceLabels}
      attachments={attachments ?? []}
      attachableFiles={attachableFiles ?? []}
      videoView={videoView}
      videoNotes={videoNotes?.ok ? videoNotes.notes : []}
      canEditOrganization={canMutateProjects(auth.context)}
      projectId={review.projectId}
      reviewId={review.id}
      projectName={review.projectName}
      reviewName={review.name}
      backHref={backHref}
      members={members}
      history={history}
      historyError={historyError}
      comments={comments}
      commentsError={commentsError}
      behavioralSnapshots={(
        await listIssueBehavioralEvidence(auth.context, issue.id)
      ).map((row) => ({ id: row.id, payload: row.payload }))}
      behavioralComparisons={(
        await listIssueComparisons(auth.context, issue.id)
      ).map((row) => ({
        id: row.id,
        summary: row.summary,
        baselineVersion: row.baselineVersion,
        comparisonVersion: row.comparisonVersion,
        baselineSample: row.baselineSample,
        comparisonSample: row.comparisonSample,
        outcome: row.outcome,
      }))}
      verificationLaunch={await getVerificationLaunchContext(
        auth.context,
        review.projectId,
        review.id,
        issue.number,
      )}
      verificationRuns={await listVerificationRunsForIssue(auth.context, issue.id)}
    />
  );
}
