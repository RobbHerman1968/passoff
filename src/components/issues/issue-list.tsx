import Link from "next/link";
import { Inbox, SearchX } from "lucide-react";

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
import { buildIssueListHref } from "@/lib/issues/url";
import { formatRelativeActivity } from "@/lib/projects/format";
import { cn } from "@/lib/utils";

/** Full table when the list has the whole content width. */
const COLUMNS_FULL =
  "md:grid-cols-[3.5rem_minmax(12rem,1.4fr)_8rem_5.5rem_7rem_5.5rem]";

/**
 * Compact table for the triage split: keep title readable, park the rest
 * under the title or in a short status column.
 */
const COLUMNS_COMPACT = "md:grid-cols-[3.5rem_minmax(0,1fr)_8rem]";

function issueAccessibleName(issue: IssueListItem) {
  return `Issue ${issue.number}: ${issue.displayTitle}, ${ISSUE_STATUS_LABELS[issue.status]}, ${ISSUE_PRIORITY_LABELS[issue.priority]} priority.`;
}

export function IssueList({
  issues,
  pathname,
  filters,
  selectedIssue,
  hasFilters,
  installed,
  compact = false,
}: {
  issues: IssueListItem[];
  pathname: string;
  filters: IssueListFilters;
  selectedIssue?: number;
  hasFilters: boolean;
  installed: boolean;
  /** Use denser rows when a preview pane shares the width. */
  compact?: boolean;
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

  const columns = compact ? COLUMNS_COMPACT : COLUMNS_FULL;

  return (
    <ResourceList
      label="Issues"
      header={
        <ResourceListHeader
          className={columns}
          columns={
            compact
              ? ["Issue", "Title", "Status"]
              : ["Issue", "Title", "Status", "Priority", "Assignee", "Updated"]
          }
        />
      }
    >
      {issues.map((issue) => {
        const selected = selectedIssue === issue.number;
        const href = buildIssueListHref(pathname, {
          q: filters.q,
          show: filters.show,
          priority: filters.priority,
          assignee: filters.assignee,
          page: filters.page,
          video: filters.video,
          p: filters.p,
          issue: issue.number,
        });
        const meta = [
          ISSUE_PRIORITY_LABELS[issue.priority],
          issue.pageRoute ?? issue.pageTitle,
          issue.assigneeDisplayName,
          formatRelativeActivity(issue.updatedAt),
        ]
          .filter(Boolean)
          .join(" · ");

        return (
          <ResourceRow
            key={issue.id}
            className={cn(columns, selected && "bg-muted/50")}
          >
            <div className="flex min-w-0 flex-col gap-1 md:contents">
              <div className="flex min-w-0 items-baseline gap-3 md:contents">
                <p className="shrink-0 font-medium tabular-nums text-muted-foreground md:text-foreground">
                  <span aria-hidden="true">#{issue.number}</span>
                  <span className="sr-only">Issue {issue.number}</span>
                </p>
                <div className="grid min-w-0 gap-0.5">
                  <h3 className="min-w-0 truncate text-sm font-semibold">
                    <Link
                      id={`issue-row-${issue.number}`}
                      href={href}
                      data-row-link=""
                      scroll={false}
                      aria-current={selected ? "true" : undefined}
                      aria-label={issueAccessibleName(issue)}
                      className="outline-none after:absolute after:inset-0 after:content-[''] hover:underline hover:underline-offset-4"
                    >
                      {issue.displayTitle}
                    </Link>
                  </h3>
                  {compact ? (
                    <p className="truncate text-xs text-muted-foreground">
                      {meta}
                    </p>
                  ) : issue.pageRoute ? (
                    <p className="hidden truncate text-xs text-muted-foreground md:block">
                      {issue.pageRoute}
                    </p>
                  ) : null}
                </div>
              </div>

              <div className="relative z-10 flex flex-wrap items-center gap-2 md:contents">
                <div className="md:justify-self-start">
                  <StatusBadge status={issue.status} />
                </div>
                {!compact ? (
                  <>
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
                    <p className="truncate text-xs text-muted-foreground md:hidden">
                      {meta}
                    </p>
                  </>
                ) : null}
              </div>
            </div>
          </ResourceRow>
        );
      })}
    </ResourceList>
  );
}
