import Link from "next/link";
import { Globe, MessageSquarePlus, SearchX } from "lucide-react";

import { ApprovalStatusPill } from "@/components/approvals/approval-status-pill";
import { EmptyState } from "@/components/empty-state";
import {
  ResourceList,
  ResourceListHeader,
  ResourceRow,
  ResourceRowTitle,
} from "@/components/resource-list";
import { CreateReviewDialog } from "@/components/reviews/create-review-dialog";
import { ReviewActionsMenu } from "@/components/reviews/review-actions-menu";
import { ReviewStatusBadge } from "@/components/workflow-status-badge";
import { Button } from "@/components/ui/button";
import {
  formatOpenIssueCount,
  formatRelativeActivity,
  formatVersionLabel,
} from "@/lib/projects/format";
import type { ReviewApprovalSummary } from "@/lib/approvals/types";
import type { ReviewListItem } from "@/lib/projects/service";
import { cn } from "@/lib/utils";

const COLUMNS = "md:grid-cols-[minmax(0,1fr)_9rem_9rem_8rem_2.75rem]";

export function ReviewList({
  projectId,
  reviews,
  hasFilters,
  canAddReview,
  projectArchived,
  approvalSummaries,
}: {
  projectId: string;
  reviews: ReviewListItem[];
  /** Approval state per review id. Omit when it couldn’t be loaded. */
  approvalSummaries?: ReadonlyMap<string, ReviewApprovalSummary>;
  hasFilters: boolean;
  canAddReview: boolean;
  projectArchived: boolean;
}) {
  if (reviews.length === 0 && !hasFilters) {
    return (
      <EmptyState
        headingLevel={3}
        icon={<MessageSquarePlus />}
        title="No reviews yet"
        description="A review is one website your client checks. Add the address, install Passoff on the site, and share the link when it’s ready."
        action={
          canAddReview && !projectArchived ? (
            <CreateReviewDialog
              projectId={projectId}
              trigger={<Button type="button">Add review</Button>}
            />
          ) : (
            <Button asChild variant="outline">
              <Link href="/dashboard">Back to projects</Link>
            </Button>
          )
        }
      />
    );
  }

  if (reviews.length === 0 && hasFilters) {
    return (
      <EmptyState
        headingLevel={3}
        icon={<SearchX />}
        title="No matching reviews"
        description="Try a different name, or clear your filters to see all reviews."
        action={
          <Button asChild variant="outline">
            <Link href={`/projects/${projectId}`}>Clear filters</Link>
          </Button>
        }
      />
    );
  }

  return (
    <ResourceList
      label="Reviews"
      header={
        <ResourceListHeader
          className={COLUMNS}
          columns={["Review", "Version", "Open issues", "Last activity", ""]}
        />
      }
    >
      {reviews.map((review) => {
        const archived = Boolean(review.archivedAt);
        const approval = approvalSummaries?.get(review.id);
        return (
          <ResourceRow key={review.id} className={COLUMNS}>
            <div className="flex min-w-0 items-center gap-3">
              <span
                aria-hidden="true"
                className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground ring-1 ring-border ring-inset"
              >
                <Globe className="size-4" />
              </span>
              <div className="grid min-w-0 gap-0.5">
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <ResourceRowTitle
                    href={`/projects/${projectId}/reviews/${review.id}`}
                  >
                    {review.name}
                  </ResourceRowTitle>
                  <ReviewStatusBadge status={review.status} archived={archived} />
                </div>
                <p className="truncate text-xs text-muted-foreground">
                  {review.environmentName} · Owner: {review.ownerName}
                </p>
                {approval && approval.visibleState !== "not_requested" ? (
                  <div>
                    <ApprovalStatusPill
                      state={approval.visibleState}
                      currentVersionLabel={approval.currentVersionLabel}
                      approvedVersionLabel={approval.approvedVersionLabel}
                      className="h-auto min-h-6 max-w-full whitespace-normal py-0.5"
                    />
                  </div>
                ) : null}
              </div>
            </div>

            <dl className="col-span-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground md:col-span-3 md:grid md:grid-cols-subgrid md:items-center">
              <div className="min-w-0">
                <dt className="sr-only">Version</dt>
                <dd className="truncate">
                  {formatVersionLabel(
                    review.deploymentIdentifier,
                    review.isHistorical,
                  )}
                </dd>
              </div>
              <div>
                <dt className="sr-only">Open issues</dt>
                <dd
                  className={cn(
                    review.openIssueCount > 0 && "font-medium text-foreground",
                  )}
                >
                  {formatOpenIssueCount(review.openIssueCount)}
                </dd>
              </div>
              <div>
                <dt className="sr-only">Last activity</dt>
                <dd>
                  <time dateTime={review.updatedAt.toISOString()}>
                    {formatRelativeActivity(review.updatedAt)}
                  </time>
                </dd>
              </div>
            </dl>

            <div className="relative z-10 col-start-2 row-start-1 justify-self-end md:col-start-auto md:row-start-auto">
              <ReviewActionsMenu
                projectId={projectId}
                reviewId={review.id}
                reviewName={review.name}
                version={review.version}
                archived={archived}
                disabled={projectArchived}
                triggerVariant="ghost"
              />
            </div>
          </ResourceRow>
        );
      })}
    </ResourceList>
  );
}
