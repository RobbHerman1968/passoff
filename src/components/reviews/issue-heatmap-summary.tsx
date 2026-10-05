import Link from "next/link";

import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { summarizeHeatmapForReview } from "@/lib/heatmap/service";

export async function IssueHeatmapSummary({
  workspaceId,
  projectId,
  reviewId,
}: {
  workspaceId: string;
  projectId: string;
  reviewId: string;
}) {
  const summary = await summarizeHeatmapForReview(workspaceId, projectId, reviewId);
  if (!summary) return null;

  return (
    <section
      aria-labelledby="issue-heatmap-heading"
      className="grid gap-3 rounded-xl border border-border bg-card p-4 sm:p-5"
    >
      <div className="grid gap-1">
        <h2 id="issue-heatmap-heading" className="type-section-title">
          Issue heatmap
        </h2>
        <p className="text-sm text-muted-foreground">
          This map shows where review issues are concentrated. It does not track
          website visitors or their behavior.
        </p>
        <p className="text-sm text-muted-foreground">
          {summary.environmentName} · {summary.versionLabel}
        </p>
      </div>
      {summary.total === 0 || summary.located === 0 ? (
        <EmptyState
          headingLevel={3}
          title="No issue locations are available yet"
          description="Add feedback directly on the website to build this map."
          action={
            <Button asChild>
              <Link href="#website-setup">Open website review</Link>
            </Button>
          }
        />
      ) : (
        <>
          <ul className="grid gap-2">
            {summary.pages.map((page) => (
              <li key={page.route} className="rounded-lg border border-border p-3 text-sm">
                <p className="font-medium break-all">{page.title || page.route}</p>
                <p className="text-muted-foreground">
                  {page.topLabel} · {page.total} active{" "}
                  {page.total === 1 ? "issue" : "issues"} · {page.located} located
                  {page.unresolved > 0 ? ` · ${page.unresolved} could not be located` : ""}
                </p>
              </li>
            ))}
          </ul>
          <Button asChild>
            <Link href="#website-setup">Open heatmap on website</Link>
          </Button>
        </>
      )}
    </section>
  );
}
