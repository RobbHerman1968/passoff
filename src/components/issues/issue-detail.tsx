import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import type { ReactNode } from "react";

import { IssuePriorityLabel } from "@/components/issues/issue-priority";
import { IssueScreenshot } from "@/components/issues/issue-screenshot";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import type { IssueDetail as IssueDetailData } from "@/lib/issues/list";
import {
  ISSUE_PRIORITY_LABELS,
  ISSUE_STATUS_LABELS,
} from "@/lib/issues/statuses";
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
}: {
  issue: IssueDetailData;
  projectId: string;
  reviewId: string;
  projectName: string;
  reviewName: string;
  backHref: string;
}) {
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
    <>
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
        status={
          <span className="flex flex-wrap items-center gap-2">
            <StatusBadge status={issue.status} />
            <IssuePriorityLabel priority={issue.priority} />
          </span>
        }
        description={
          <>
            Issue #{issue.number}
            <span className="sr-only">
              {`, ${ISSUE_STATUS_LABELS[issue.status]}, ${ISSUE_PRIORITY_LABELS[issue.priority]} priority`}
            </span>
          </>
        }
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
        </div>

        <aside aria-label="Issue details" className="grid min-w-0 gap-4">
          <section
            aria-labelledby="issue-details-heading"
            className="rounded-xl border border-border bg-card p-4 text-card-foreground"
          >
            <h2 id="issue-details-heading" className="type-section-title">
              Details
            </h2>
            <dl className="mt-3 grid gap-3 text-sm">
              <DetailRow label="Reporter" value={issue.reporterDisplayName} />
              <DetailRow label="Assignee" value={issue.assigneeDisplayName} />
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
              <DetailRow
                label="Updated"
                value={
                  <time dateTime={issue.updatedAt.toISOString()}>
                    {formatRelativeActivity(issue.updatedAt)}
                  </time>
                }
              />
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
    </>
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
