"use client";

import Link from "next/link";
import { WifiOff } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { IssueList } from "@/components/issues/issue-list";
import { IssueListFilters } from "@/components/issues/issue-list-filters";
import { ExportIssuesDialog } from "@/components/issues/export-issues-dialog";
import { useOnlineStatus } from "@/components/issues/use-online-status";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import type { IssueListFacets, IssueListItem } from "@/lib/issues/list";
import {
  issueListHasActiveFilters,
  type IssueListFilters as IssueListFilterValues,
} from "@/lib/issues/schemas";
import { buildIssueListHref } from "@/lib/issues/url";

export function IssueTriage({
  projectId,
  reviewId,
  pathname,
  filters,
  issues,
  total,
  page,
  pageCount,
  facets,
  installed,
}: {
  projectId: string;
  reviewId: string;
  pathname: string;
  filters: IssueListFilterValues;
  issues: IssueListItem[];
  total: number;
  page: number;
  pageCount: number;
  facets: IssueListFacets;
  installed: boolean;
}) {
  const online = useOnlineStatus();
  const router = useRouter();
  const hasFilters = issueListHasActiveFilters(filters);
  const [exportOpen, setExportOpen] = useState(false);

  return (
    <div className="grid gap-4">
      {!online ? (
        <Alert>
          <WifiOff aria-hidden="true" />
          <AlertTitle>You’re offline</AlertTitle>
          <AlertDescription>
            You can still read the issues already on this page. Refreshing or
            changing filters may not work until you’re back online.
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-3 min-h-11"
              onClick={() => {
                if (typeof navigator !== "undefined" && navigator.onLine) {
                  router.refresh();
                }
              }}
            >
              Try again
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="flex flex-wrap items-center justify-end">
        <Button type="button" variant="outline" onClick={() => setExportOpen(true)}>
          Export issues
        </Button>
      </div>
      <IssueListFilters filters={filters} facets={facets} />

      <div className="grid min-w-0 gap-3">
        <IssueList
          issues={issues}
          projectId={projectId}
          reviewId={reviewId}
          pathname={pathname}
          filters={filters}
          hasFilters={hasFilters}
          installed={installed}
        />

        {pageCount > 1 ? (
          <nav
            aria-label="Issue pages"
            className="flex flex-wrap items-center justify-between gap-3"
          >
            <p className="text-sm text-muted-foreground">
              Page {page} of {pageCount}
              <span className="sr-only">, {total} issues</span>
            </p>
            <div className="flex gap-2">
              <Button
                asChild
                variant="outline"
                disabled={page <= 1}
                className={page <= 1 ? "pointer-events-none opacity-50" : undefined}
              >
                <Link
                  href={buildIssueListHref(pathname, {
                    q: filters.q,
                    show: filters.show,
                    priority: filters.priority,
                    assignee: filters.assignee,
                    page: filters.page,
                    video: filters.video,
                    p: Math.max(1, page - 1),
                  })}
                  scroll={false}
                  aria-disabled={page <= 1}
                >
                  Previous
                </Link>
              </Button>
              <Button
                asChild
                variant="outline"
                disabled={page >= pageCount}
                className={
                  page >= pageCount ? "pointer-events-none opacity-50" : undefined
                }
              >
                <Link
                  href={buildIssueListHref(pathname, {
                    q: filters.q,
                    show: filters.show,
                    priority: filters.priority,
                    assignee: filters.assignee,
                    page: filters.page,
                    video: filters.video,
                    p: Math.min(pageCount, page + 1),
                  })}
                  scroll={false}
                  aria-disabled={page >= pageCount}
                >
                  Next
                </Link>
              </Button>
            </div>
          </nav>
        ) : null}
      </div>
      <ExportIssuesDialog
        open={exportOpen}
        onOpenChange={setExportOpen}
        projectId={projectId}
        reviewId={reviewId}
        filters={filters}
        matchingCount={total}
      />
    </div>
  );
}
