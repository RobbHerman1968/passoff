"use client";

import { History } from "lucide-react";

import { listIssueHistoryAction } from "@/app/(app)/projects/issue-triage-actions";
import { EmptyState } from "@/components/empty-state";
import { useIssueTriage } from "@/components/issues/issue-triage-context";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { formatRelativeActivity } from "@/lib/projects/format";

export function IssueHistorySection() {
  const {
    projectId,
    reviewId,
    issueNumber,
    history,
    historyError,
    historyLoading,
    setHistory,
    setHistoryError,
    setHistoryLoading,
  } = useIssueTriage();

  async function retry() {
    setHistoryLoading(true);
    setHistoryError(null);
    try {
      const result = await listIssueHistoryAction({
        projectId,
        reviewId,
        issueNumber,
      });
      if (!result.ok) {
        setHistoryError(result.message);
        return;
      }
      setHistory(result.events);
    } catch {
      setHistoryError("We couldn’t load history. Try again.");
    } finally {
      setHistoryLoading(false);
    }
  }

  return (
    <section
      aria-labelledby="issue-history-heading"
      className="rounded-xl border border-border bg-card p-4 text-card-foreground sm:p-5"
    >
      <h2 id="issue-history-heading" className="type-section-title">
        History
      </h2>

      {historyLoading ? (
        <div className="mt-4 grid gap-3" role="status" aria-live="polite" aria-busy="true">
          <p className="sr-only">Loading history</p>
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-4 w-1/2" />
        </div>
      ) : historyError ? (
        <div className="mt-4">
          <EmptyState
            headingLevel={3}
            title="We couldn’t load history"
            description={historyError}
            action={
              <Button type="button" onClick={() => void retry()}>
                Try again
              </Button>
            }
          />
        </div>
      ) : history.length === 0 ? (
        <div className="mt-4">
          <EmptyState
            headingLevel={3}
            icon={<History />}
            title="No history yet"
            description="Changes to status, priority, and assignment will appear here."
          />
        </div>
      ) : (
        <ol className="mt-4 grid gap-3">
          {history.map((event) => {
            const createdAt = new Date(event.createdAt);
            return (
              <li key={event.id} className="grid min-w-0 gap-0.5 text-sm">
                <p className="break-words">{event.summary}</p>
                <time
                  className="text-xs text-muted-foreground"
                  dateTime={createdAt.toISOString()}
                >
                  {formatRelativeActivity(createdAt)}
                </time>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
