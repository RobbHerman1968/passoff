import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import type { ReactNode } from "react";

import { IssueAssigneeField } from "@/components/issues/issue-assignee-field";
import { IssueDiscussion } from "@/components/issues/issue-discussion";
import { IssueHistorySection } from "@/components/issues/issue-history";
import { IssueBehavioralEvidence } from "@/components/issues/issue-behavioral-evidence";
import { IssueVerificationChecks } from "@/components/issues/issue-verification-checks";
import { IssueLiveStatusBadge } from "@/components/issues/issue-live-status";
import { IssuePriorityField } from "@/components/issues/issue-priority-field";
import { IssueScreenshot } from "@/components/issues/issue-screenshot";
import { IssueStatusAction } from "@/components/issues/issue-status-action";
import { IssueTriageProvider } from "@/components/issues/issue-triage-context";
import { IssueUpdatedTime } from "@/components/issues/issue-updated-time";
import { PageHeader } from "@/components/page-header";
import { IssueAttachmentsSection } from "@/components/attachments/issue-attachments-section";
import { IssueLabelsSection } from "@/components/labels/issue-labels-section";
import { IssueVideoSection } from "@/components/video/issue-video-section";
import type { VideoNoteView } from "@/lib/video/annotations/types";
import type { IssueVideoView } from "@/lib/video/states";
import { Button } from "@/components/ui/button";
import type { AttachableAssetView, AttachmentView } from "@/lib/attachments/types";
import type { LabelView } from "@/lib/labels/types";
import type { IssueCommentView } from "@/lib/comments/types";
import type { IssueHistoryEvent } from "@/lib/issues/history";
import type { IssueDetail as IssueDetailData } from "@/lib/issues/list";
import type { VerificationLaunchContext } from "@/lib/verification/launch";
import type { VerificationRunView } from "@/lib/verification/query";
import {
  ISSUE_PRIORITY_LABELS,
  ISSUE_STATUS_LABELS,
} from "@/lib/issues/statuses";
import type { AssignableMember } from "@/lib/issues/triage-types";
import { issueDetailPath } from "@/lib/issues/url";
import { formatRelativeActivity } from "@/lib/projects/format";

function screenshotStateLabel(
  status: IssueDetailData["screenshotCaptureStatus"],
): string {
  if (status === "ready") return "Ready";
  if (status === "pending") return "Still preparing";
  if (status === "failed") return "Couldn’t be prepared";
  return "Not available";
}

export function IssueDetailView({
  issue,
  projectId,
  reviewId,
  projectName,
  reviewName,
  backHref,
  members = [],
  history = [],
  historyError = null,
  comments = [],
  commentsError = null,
  behavioralSnapshots = [],
  behavioralComparisons = [],
  verificationLaunch = null,
  verificationRuns = [],
  labels = [],
  workspaceLabels = [],
  attachments = [],
  attachableFiles = [],
  videoView = null,
  videoNotes = [],
  canEditOrganization = false,
}: {
  issue: IssueDetailData;
  projectId: string;
  reviewId: string;
  projectName: string;
  reviewName: string;
  backHref: string;
  members?: AssignableMember[];
  history?: IssueHistoryEvent[];
  historyError?: string | null;
  comments?: IssueCommentView[];
  commentsError?: string | null;
  behavioralSnapshots?: Array<{ id: string; payload: Record<string, unknown> }>;
  behavioralComparisons?: Array<{
    id: string;
    summary: string;
    baselineVersion: string;
    comparisonVersion: string;
    baselineSample: number;
    comparisonSample: number;
    outcome: string;
  }>;
  verificationLaunch?: VerificationLaunchContext | null;
  verificationRuns?: VerificationRunView[];
  labels?: LabelView[];
  workspaceLabels?: LabelView[];
  attachments?: AttachmentView[];
  attachableFiles?: AttachableAssetView[];
  /** Video evidence state for this issue. Null when it could not be loaded. */
  videoView?: IssueVideoView | null;
  videoNotes?: VideoNoteView[];
  /** Members can add labels and attachments; read-only views cannot. */
  canEditOrganization?: boolean;
}) {
  const issueDetailHref = issueDetailPath(projectId, reviewId, issue.number);
  const pageLocation =
    issue.pageRoute || issue.pageUrl
      ? (
          <span className="grid min-w-0 gap-0.5">
            {issue.pageRoute ? (
              <span className="break-words font-medium">{issue.pageRoute}</span>
            ) : null}
            {issue.pageUrl ? (
              <span className="break-all text-muted-foreground">{issue.pageUrl}</span>
            ) : null}
          </span>
        )
      : (
          "Not recorded"
        );

  return (
    <IssueTriageProvider
      projectId={projectId}
      reviewId={reviewId}
      issueNumber={issue.number}
      members={members}
      initialHistory={history}
      initialHistoryError={historyError}
      initialSnapshot={{
        version: issue.version,
        status: issue.status,
        priority: issue.priority,
        assigneeUserId: issue.assigneeUserId,
        assigneeDisplayName: issue.assigneeDisplayName,
        updatedAt: issue.updatedAt.toISOString(),
      }}
    >
      <PageHeader
        title={issue.displayTitle}
        breadcrumbs={[
          { href: "/dashboard", label: "Projects" },
          { href: `/projects/${projectId}`, label: projectName },
          {
            href: `/projects/${projectId}/reviews/${reviewId}`,
            label: reviewName,
          },
          { label: `Issue #${issue.number}` },
        ]}
        status={<IssueLiveStatusBadge />}
        description={
          <>
            Issue #{issue.number}
            <span className="sr-only">
              {`, ${ISSUE_STATUS_LABELS[issue.status]}, ${ISSUE_PRIORITY_LABELS[issue.priority]} priority`}
            </span>
          </>
        }
        primaryAction={<IssueStatusAction />}
        secondaryActions={
          <Button asChild variant="outline">
            <Link href={backHref}>
              <ArrowLeft data-icon="inline-start" aria-hidden="true" />
              Back to issues
            </Link>
          </Button>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
        <div className="grid min-w-0 gap-6">
          <IssueScreenshot
            projectId={projectId}
            reviewId={reviewId}
            issueNumber={issue.number}
            status={issue.screenshotCaptureStatus}
            captureMethod={issue.screenshotCaptureMethod}
            annotation={issue.screenshotAnnotation}
          />

          <IssueVideoSection
            projectId={projectId}
            reviewId={reviewId}
            issueNumber={issue.number}
            initialView={videoView}
            initialNotes={videoNotes}
          />

          <IssueBehavioralEvidence
            snapshots={behavioralSnapshots}
            comparisons={behavioralComparisons}
            issueId={issue.id}
            canRequestComparison={
              issue.status === "ready_for_verification" || issue.status === "verified"
            }
          />

          <IssueVerificationChecks
            projectId={projectId}
            reviewId={reviewId}
            issueNumber={issue.number}
            launch={verificationLaunch}
            runs={verificationRuns}
          />

          <section
            aria-labelledby="issue-feedback-heading"
            className="rounded-xl border border-border bg-card p-4 text-card-foreground sm:p-5"
          >
            <h2 id="issue-feedback-heading" className="type-section-title">
              Feedback
            </h2>
            <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-relaxed">
              {issue.body}
            </p>
          </section>

          {commentsError ? (
            <section
              aria-labelledby="issue-discussion-heading"
              className="rounded-xl border border-border bg-card p-4 text-card-foreground sm:p-5"
            >
              <h2 id="issue-discussion-heading" className="type-section-title">
                Discussion
              </h2>
              <p role="alert" className="mt-3 text-sm text-destructive">
                {commentsError}
              </p>
              <Button asChild variant="outline" className="mt-3">
                <Link href={issueDetailHref}>Reload discussion</Link>
              </Button>
            </section>
          ) : (
            <IssueDiscussion
              projectId={projectId}
              reviewId={reviewId}
              issueNumber={issue.number}
              initialComments={comments}
              members={members}
            />
          )}

          <IssueAttachmentsSection
            projectId={projectId}
            reviewId={reviewId}
            issueNumber={issue.number}
            initialAttachments={attachments}
            attachable={attachableFiles}
            canEdit={canEditOrganization}
          />

          <IssueHistorySection />
        </div>

        <aside aria-label="Issue details" className="grid min-w-0 gap-4">
          <section
            aria-labelledby="issue-details-heading"
            className="rounded-xl border border-border bg-card p-4 text-card-foreground"
          >
            <h2 id="issue-details-heading" className="type-section-title">
              Details
            </h2>
            <div className="mt-3 grid gap-4">
              <IssueAssigneeField />
              <IssuePriorityField />
              <IssueLabelsSection
                initialLabels={labels}
                workspaceLabels={workspaceLabels}
                canEdit={canEditOrganization}
              />
            </div>
            <dl className="mt-4 grid gap-3 text-sm">
              <DetailRow label="Reporter" value={issue.reporterDisplayName} />
              <DetailRow
                label="Page title"
                value={issue.pageTitle ?? "Not recorded"}
              />
              <DetailRow label="Page" value={pageLocation} />
              <DetailRow label="Environment" value={issue.environmentName} />
              <DetailRow label="Version" value={issue.versionLabel} />
              <DetailRow
                label="Created"
                value={
                  <time dateTime={issue.createdAt.toISOString()}>
                    {formatRelativeActivity(issue.createdAt)}
                  </time>
                }
              />
              <DetailRow label="Updated" value={<IssueUpdatedTime />} />
              <DetailRow
                label="Screenshot"
                value={screenshotStateLabel(issue.screenshotCaptureStatus)}
              />
              <DetailRow
                label="Video"
                value={issue.hasVideoEvidence ? "Attached" : "Not attached"}
              />
            </dl>
          </section>
        </aside>
      </div>
    </IssueTriageProvider>
  );
}

export function IssueUnavailableView({
  projectId,
  projectName,
  reviewId,
  reviewName,
  backHref,
  issueNumber,
}: {
  projectId: string;
  projectName: string;
  reviewId: string;
  reviewName: string;
  backHref: string;
  issueNumber?: number;
}) {
  return (
    <>
      <PageHeader
        title="This issue isn’t available"
        breadcrumbs={[
          { href: "/dashboard", label: "Projects" },
          { href: `/projects/${projectId}`, label: projectName },
          {
            href: `/projects/${projectId}/reviews/${reviewId}`,
            label: reviewName,
          },
          {
            label: issueNumber ? `Issue #${issueNumber}` : "Issue",
          },
        ]}
        description="It may have been removed, or the link may be out of date."
        secondaryActions={
          <Button asChild variant="outline">
            <Link href={backHref}>
              <ArrowLeft data-icon="inline-start" aria-hidden="true" />
              Back to issues
            </Link>
          </Button>
        }
      />
      <div className="rounded-xl border border-border bg-card p-6 text-card-foreground">
        <p className="text-sm text-muted-foreground">
          Choose another issue from the list, or go back to the review to continue
          triage.
        </p>
        <Button asChild className="mt-4">
          <Link href={backHref}>Back to issues</Link>
        </Button>
      </div>
    </>
  );
}

function DetailRow({
  label,
  value,
}: {
  label: string;
  value: ReactNode;
}) {
  return (
    <div className="grid min-w-0 gap-1 sm:grid-cols-[7rem_minmax(0,1fr)] sm:gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words font-medium">{value}</dd>
    </div>
  );
}
