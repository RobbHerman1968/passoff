import Link from "next/link";
import { Camera, Inbox, SearchX, Video } from "lucide-react";

import { EmptyState } from "@/components/empty-state";
import { IssuePriorityLabel } from "@/components/issues/issue-priority";
import {
  ResourceList,
  ResourceListHeader,
  ResourceRow,
} from "@/components/resource-list";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import type { IssueListItem } from "@/lib/issues/list";
import {
  ISSUE_PRIORITY_LABELS,
  ISSUE_STATUS_LABELS,
} from "@/lib/issues/statuses";
import type { IssueListFilters } from "@/lib/issues/schemas";
import {
  buildIssueDetailHref,
  buildIssueListHref,
} from "@/lib/issues/url";
import { formatRelativeActivity } from "@/lib/projects/format";

const COLUMNS =
  "md:grid-cols-[3.5rem_minmax(12rem,1.6fr)_8rem_5.5rem_7rem_5.5rem_4.5rem]";

function issueAccessibleName(issue: IssueListItem) {
  const evidence: string[] = [];
  if (issue.screenshotCaptureStatus === "ready") {
    evidence.push("has screenshot");
  }
  if (issue.hasVideoEvidence) {
    evidence.push("has video");
  }
  const evidenceSuffix = evidence.length ? `, ${evidence.join(" and ")}` : "";

  return `Issue ${issue.number}: ${issue.displayTitle}, ${ISSUE_STATUS_LABELS[issue.status]}, ${ISSUE_PRIORITY_LABELS[issue.priority]} priority${evidenceSuffix}.`;
}

function EvidenceIndicators({ issue }: { issue: IssueListItem }) {
  const showScreenshot = issue.screenshotCaptureStatus === "ready";
  const showVideo = issue.hasVideoEvidence;
  if (!showScreenshot && !showVideo) {
    return <span className="sr-only">No evidence attached</span>;
  }

  return (
    <span className="inline-flex items-center gap-2 text-muted-foreground">
      {showScreenshot ? (
        <span className="inline-flex items-center gap-1" title="Screenshot">
          <Camera aria-hidden="true" className="size-3.5" />
          <span className="sr-only">Screenshot</span>
        </span>
      ) : null}
      {showVideo ? (
        <span className="inline-flex items-center gap-1" title="Video">
          <Video aria-hidden="true" className="size-3.5" />
          <span className="sr-only">Video</span>
        </span>
      ) : null}
    </span>
  );
}

export function IssueList({
  issues,
  projectId,
  reviewId,
  pathname,
  filters,
  hasFilters,
  installed,
}: {
  issues: IssueListItem[];
  projectId: string;
  reviewId: string;
  pathname: string;
  filters: IssueListFilters;
  hasFilters: boolean;
  installed: boolean;
}) {
  if (issues.length === 0 && !hasFilters) {
    return (
      <EmptyState
        headingLevel={3}
        icon={<Inbox />}
        title="No issues yet"
        description={
          installed
            ? "Issues appear here when a guest adds feedback on the website."
            : "Once Passoff is installed on the website, each issue your client pins will show up here."
        }
      />
    );
  }

  if (issues.length === 0 && hasFilters) {
    return (
      <EmptyState
        headingLevel={3}
        icon={<SearchX />}
        title="No matching issues"
        description="Try a different search, or clear your filters to see active issues again."
        action={
          <Button asChild variant="outline">
            <Link href={buildIssueListHref(pathname, { show: "active" })}>
              Clear filters
            </Link>
          </Button>
        }
      />
    );
  }

  return (
    <ResourceList
      label="Issues"
      header={
        <ResourceListHeader
          className={COLUMNS}
          columns={[
            "Issue",
            "Title",
            "Status",
            "Priority",
            "Assignee",
            "Updated",
            "Evidence",
          ]}
        />
      }
    >
      {issues.map((issue) => {
        const href = buildIssueDetailHref(
          projectId,
          reviewId,
          issue.number,
          filters,
        );
        const pageLabel = issue.pageRoute ?? issue.pageTitle;
        const mobileMeta = [
          ISSUE_PRIORITY_LABELS[issue.priority],
          pageLabel,
          issue.assigneeDisplayName,
          formatRelativeActivity(issue.updatedAt),
        ]
          .filter(Boolean)
          .join(" · ");

        return (
          <ResourceRow key={issue.id} className={COLUMNS}>
            <div className="flex min-w-0 flex-col gap-1 md:contents">
              <div className="flex min-w-0 items-baseline gap-3 md:contents">
                <p className="shrink-0 text-sm font-medium tabular-nums text-muted-foreground">
                  <span aria-hidden="true">#{issue.number}</span>
                  <span className="sr-only">Issue {issue.number}</span>
                </p>
                <div className="grid min-w-0 gap-0.5">
                  <h3 className="min-w-0 text-sm font-semibold">
                    <Link
                      id={`issue-row-${issue.number}`}
                      href={href}
                      data-row-link=""
                      aria-label={issueAccessibleName(issue)}
                      className="break-words outline-none after:absolute after:inset-0 after:content-[''] hover:underline hover:underline-offset-4"
                    >
                      {issue.displayTitle}
                    </Link>
                  </h3>
                  {pageLabel ? (
                    <p className="hidden truncate text-xs text-muted-foreground md:block">
                      {pageLabel}
                    </p>
                  ) : null}
                </div>
              </div>

              <div className="relative z-10 flex flex-wrap items-center gap-2 md:contents">
                <div className="md:justify-self-start">
                  <StatusBadge status={issue.status} />
                </div>
                <p className="hidden min-w-0 md:block">
                  <IssuePriorityLabel priority={issue.priority} />
                </p>
                <p className="hidden truncate text-sm text-muted-foreground md:block">
                  {issue.assigneeDisplayName}
                </p>
                <p className="hidden text-sm text-muted-foreground md:block">
                  <time dateTime={issue.updatedAt.toISOString()}>
                    {formatRelativeActivity(issue.updatedAt)}
                  </time>
                </p>
                <p className="hidden md:block">
                  <EvidenceIndicators issue={issue} />
                </p>
                <p className="flex min-w-0 items-center gap-2 truncate text-xs text-muted-foreground md:hidden">
                  <span className="truncate">{mobileMeta}</span>
                  <EvidenceIndicators issue={issue} />
                </p>
              </div>
            </div>
          </ResourceRow>
        );
      })}
    </ResourceList>
  );
}
