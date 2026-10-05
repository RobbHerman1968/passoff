"use client";

import Link from "next/link";
import { WifiOff } from "lucide-react";
import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

import { IssueList } from "@/components/issues/issue-list";
import { IssueListFilters } from "@/components/issues/issue-list-filters";
import { IssuePreviewPanel } from "@/components/issues/issue-preview";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import type {
  IssueListFacets,
  IssueListItem,
  IssuePreview,
} from "@/lib/issues/list";
import {
  issueListHasActiveFilters,
  type IssueListFilters as IssueListFilterValues,
} from "@/lib/issues/schemas";
import { buildIssueListHref } from "@/lib/issues/url";
import { cn } from "@/lib/utils";

import { useOnlineStatus } from "@/components/issues/use-online-status";

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
  selectedIssueNumber,
  selectedIssue,
  selectedUnavailable,
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
  selectedIssueNumber?: number;
  selectedIssue?: IssuePreview | null;
  selectedUnavailable?: boolean;
  installed: boolean;
}) {
  const online = useOnlineStatus();
  const router = useRouter();
  const previousSelected = useRef<number | undefined>(undefined);
  const hasFilters = issueListHasActiveFilters(filters);
  const showPreview = Boolean(selectedIssueNumber);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const isMobile = window.matchMedia("(max-width: 1023px)").matches;
    const previous = previousSelected.current;
    previousSelected.current = selectedIssueNumber;

    if (selectedIssueNumber && isMobile) {
      const heading = document.getElementById("issue-preview-heading");
      heading?.focus();
      return;
    }

    if (!selectedIssueNumber && previous && isMobile) {
      const row = document.getElementById(`issue-row-${previous}`);
      row?.focus();
    }
  }, [selectedIssueNumber]);

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

      <IssueListFilters
        filters={filters}
        facets={facets}
        selectedIssue={selectedIssueNumber}
      />

      <div
        className={cn(
          "grid gap-4",
          // Keep the list dominant; preview is a fixed side panel.
          showPreview
            ? "lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start"
            : "lg:grid-cols-1",
        )}
      >
        <div
          className={cn(
            "min-w-0 grid gap-3",
            showPreview && "hidden lg:grid",
          )}
        >
          <IssueList
            issues={issues}
            pathname={pathname}
            filters={filters}
            selectedIssue={selectedIssueNumber}
            hasFilters={hasFilters}
            installed={installed}
            compact={showPreview}
          />

          {!showPreview && issues.length > 0 ? (
            <p className="hidden text-sm text-muted-foreground lg:block">
              Select an issue to read the full feedback and screenshot.
            </p>
          ) : null}

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
                      issue: selectedIssueNumber,
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
                      issue: selectedIssueNumber,
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

        {showPreview ? (
          <div className="min-w-0 lg:w-80 lg:justify-self-end">
            <IssuePreviewPanel
              issue={selectedIssue}
              unavailable={selectedUnavailable}
              pathname={pathname}
              filters={filters}
              projectId={projectId}
              reviewId={reviewId}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}
