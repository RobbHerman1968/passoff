import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import type { ReactNode } from "react";

import { IssuePriorityLabel } from "@/components/issues/issue-priority";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import type { IssuePreview as IssuePreviewData } from "@/lib/issues/list";
import {
  ISSUE_PRIORITY_LABELS,
  ISSUE_STATUS_LABELS,
} from "@/lib/issues/statuses";
import type { IssueListFilters } from "@/lib/issues/schemas";
import { buildIssueListHref } from "@/lib/issues/url";
import { formatRelativeActivity } from "@/lib/projects/format";

function screenshotMessage(
  status: IssuePreviewData["screenshotCaptureStatus"],
): string | null {
  if (status === "pending") {
    return "The picture is still being prepared.";
  }
  if (status === "unavailable" || status === null) {
    return "This issue was saved, but the picture isn’t available.";
  }
  if (status === "failed") {
    return "The picture could not be prepared.";
  }
  return null;
}

export function IssuePreviewPanel({
  issue,
  pathname,
  filters,
  projectId,
  reviewId,
  unavailable = false,
}: {
  issue?: IssuePreviewData | null;
  pathname: string;
  filters: IssueListFilters;
  projectId: string;
  reviewId: string;
  unavailable?: boolean;
}) {
  const backHref = buildIssueListHref(pathname, {
    q: filters.q,
    show: filters.show,
    priority: filters.priority,
    assignee: filters.assignee,
    page: filters.page,
    video: filters.video,
    p: filters.p,
    issue: null,
  });

  if (unavailable || !issue) {
    return (
      <section
        aria-labelledby="issue-preview-heading"
        className="rounded-xl border border-border bg-card p-4 text-card-foreground lg:sticky lg:top-4"
      >
        <div className="mb-3 lg:hidden">
          <Button asChild variant="ghost" className="min-h-11 px-2">
            <Link href={backHref} scroll={false}>
              <ArrowLeft data-icon="inline-start" aria-hidden="true" />
              Back to issues
            </Link>
          </Button>
        </div>
        <h3 id="issue-preview-heading" className="type-section-title" tabIndex={-1}>
          This issue isn’t available
        </h3>
        <p className="mt-2 text-sm text-muted-foreground">
          It may have been removed, or the link may be out of date. Choose another
          issue from the list.
        </p>
      </section>
    );
  }

  const screenshotUrl = `/api/projects/${projectId}/reviews/${reviewId}/issues/${issue.number}/screenshot`;
  const screenshotCopy = screenshotMessage(issue.screenshotCaptureStatus);
  const showReconstruction =
    issue.screenshotCaptureStatus === "ready" &&
    issue.screenshotCaptureMethod === "browser_reconstruction";

  return (
    <section
      aria-labelledby="issue-preview-heading"
      className="rounded-xl border border-border bg-card p-4 text-card-foreground lg:sticky lg:top-4"
    >
      <div className="mb-3 lg:hidden">
        <Button asChild variant="ghost" className="min-h-11 px-2">
          <Link
            href={backHref}
            scroll={false}
            data-issue-back=""
          >
            <ArrowLeft data-icon="inline-start" aria-hidden="true" />
            Back to issues
          </Link>
        </Button>
      </div>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium tabular-nums text-muted-foreground">
            #{issue.number}
          </p>
          <h3
            id="issue-preview-heading"
            tabIndex={-1}
            className="type-section-title mt-1 break-words"
          >
            {issue.displayTitle}
          </h3>
          <p className="sr-only">
            {ISSUE_STATUS_LABELS[issue.status]},{" "}
            {ISSUE_PRIORITY_LABELS[issue.priority]} priority
          </p>
        </div>
        <StatusBadge status={issue.status} />
      </div>

      <dl className="mt-4 grid gap-3 text-sm">
        <PreviewRow
          label="Priority"
          value={<IssuePriorityLabel priority={issue.priority} />}
        />
        <PreviewRow label="Reporter" value={issue.reporterDisplayName} />
        <PreviewRow label="Assignee" value={issue.assigneeDisplayName} />
        <PreviewRow
          label="Page"
          value={
            issue.pageTitle || issue.pageRoute ? (
              <span className="grid min-w-0 gap-0.5 text-right">
                {issue.pageTitle ? (
                  <span className="truncate font-medium">{issue.pageTitle}</span>
                ) : null}
                {issue.pageRoute ? (
                  <span className="truncate text-muted-foreground">
                    {issue.pageRoute}
                  </span>
                ) : null}
              </span>
            ) : (
              "Not recorded"
            )
          }
        />
        <PreviewRow label="Environment" value={issue.environmentName} />
        <PreviewRow label="Version" value={issue.versionLabel} />
        <PreviewRow
          label="Created"
          value={
            <time dateTime={issue.createdAt.toISOString()}>
              {formatRelativeActivity(issue.createdAt)}
            </time>
          }
        />
        <PreviewRow
          label="Updated"
          value={
            <time dateTime={issue.updatedAt.toISOString()}>
              {formatRelativeActivity(issue.updatedAt)}
            </time>
          }
        />
      </dl>

      <div className="mt-5 grid gap-2">
        <h4 className="text-sm font-medium">Feedback</h4>
        <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">
          {issue.body}
        </p>
      </div>

      <div className="mt-5 grid gap-2">
        <h4 className="text-sm font-medium">Screenshot</h4>
        {showReconstruction ? (
          <figure className="grid gap-2">
            <div className="overflow-hidden rounded-lg border border-border bg-muted/30">
              {/* Protected binary route; next/image optimization is not needed. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={screenshotUrl}
                alt={`Browser reconstruction for issue ${issue.number}`}
                className="max-h-80 w-full object-contain"
              />
            </div>
            <figcaption className="grid gap-1 text-xs text-muted-foreground">
              <span className="font-medium text-foreground">
                Browser reconstruction
              </span>
              <span>
                This picture was created in the reviewer’s browser and may not
                match the page pixel for pixel.
              </span>
            </figcaption>
          </figure>
        ) : (
          <p className="text-sm text-muted-foreground">
            {screenshotCopy ??
              "This issue was saved, but the picture isn’t available."}
          </p>
        )}
      </div>
    </section>
  );
}

export function IssuePreviewEmpty() {
  return (
    <section
      aria-labelledby="issue-preview-empty-heading"
      className="hidden rounded-xl border border-dashed border-input/60 bg-card p-6 text-card-foreground lg:block lg:sticky lg:top-4"
    >
      <h3 id="issue-preview-empty-heading" className="type-section-title">
        Select an issue
      </h3>
      <p className="mt-2 text-sm text-muted-foreground">
        Choose an issue from the list to read the full feedback and screenshot.
      </p>
    </section>
  );
}

function PreviewRow({
  label,
  value,
}: {
  label: string;
  value: ReactNode;
}) {
  return (
    <div className="flex min-w-0 items-baseline justify-between gap-4">
      <dt className="shrink-0 text-muted-foreground">{label}</dt>
      <dd className="min-w-0 text-right font-medium">{value}</dd>
    </div>
  );
}
