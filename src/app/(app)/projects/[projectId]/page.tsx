import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Archive, CircleDot, Clock, Globe } from "lucide-react";
import { Suspense } from "react";

import { db } from "@/db";
import { listReviewApprovalSummaries } from "@/lib/approvals/requests";
import { ReviewLimitNotice } from "@/components/billing/review-limit-notice";
import { getReviewWebsiteCapacity } from "@/lib/billing/review-websites";
import { ErrorState } from "@/components/error-state";
import { LoadingState } from "@/components/loading-state";
import { PageHeader } from "@/components/page-header";
import { PermissionDeniedState } from "@/components/permission-denied-state";
import { ProjectActionsMenu } from "@/components/projects/project-actions-menu";
import { CreateReviewDialog } from "@/components/reviews/create-review-dialog";
import { ReviewFilters } from "@/components/reviews/review-filters";
import { ReviewList } from "@/components/reviews/review-list";
import { SuccessNotice } from "@/components/success-notice";
import { SummaryStats } from "@/components/summary-stats";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ProjectStatusBadge } from "@/components/workflow-status-badge";
import {
  canDeleteProjects,
  requireWorkspaceContext,
  type WorkspaceContext,
} from "@/lib/workspaces/context";
import { formatRelativeActivity } from "@/lib/projects/format";
import { reviewListFiltersSchema } from "@/lib/projects/schemas";
import {
  getProjectForWorkspace,
  listProjectReviews,
} from "@/lib/projects/service";
import { REVIEW_STATUSES } from "@/lib/projects/statuses";

type RouteParams = Promise<{ projectId: string }>;
type SearchParams = Promise<Record<string, string | string[] | undefined>>;
type ReviewStatusFilter = "all" | "archived" | (typeof REVIEW_STATUSES)[number];

export async function generateMetadata({
  params,
}: {
  params: RouteParams;
}): Promise<Metadata> {
  const { projectId } = await params;
  const auth = await requireWorkspaceContext();
  if (!auth.ok) {
    return { title: "Project" };
  }
  const project = await getProjectForWorkspace(auth.context, projectId);
  return {
    title: project?.name ?? "Project unavailable",
    description: "Project reviews and activity.",
  };
}

export default async function ProjectDetailPage({
  params,
  searchParams,
}: {
  params: RouteParams;
  searchParams: SearchParams;
}) {
  const { projectId } = await params;
  const auth = await requireWorkspaceContext();
  if (!auth.ok) {
    if (auth.reason === "unauthenticated") {
      redirect(`/sign-in?callbackUrl=/projects/${projectId}`);
    }
    redirect("/onboarding");
  }

  const project = await getProjectForWorkspace(auth.context, projectId);
  if (!project) {
    return (
      <>
        <PageHeader
          title="Project unavailable"
          description="This project isn’t available in your workspace."
          breadcrumbs={[
            { href: "/dashboard", label: "Projects" },
            { label: "Unavailable" },
          ]}
        />
        <PermissionDeniedState />
      </>
    );
  }

  const paramsRecord = await searchParams;
  const parsedFilters = reviewListFiltersSchema.safeParse({
    q: typeof paramsRecord.q === "string" ? paramsRecord.q : "",
    status:
      typeof paramsRecord.status === "string" ? paramsRecord.status : "all",
  });
  const filters = parsedFilters.success
    ? { q: parsedFilters.data.q, status: parsedFilters.data.status as ReviewStatusFilter }
    : { q: "", status: "all" as const };
  const notice =
    typeof paramsRecord.notice === "string" ? paramsRecord.notice : undefined;
  const archived = project.status === "archived";
  // A hiccup reading usage must never hide the reviews, so the notice is optional.
  const capacity = archived
    ? null
    : await getReviewWebsiteCapacity(db, auth.context.workspaceId).catch(() => null);

  return (
    <>
      <PageHeader
        title={project.name}
        breadcrumbs={[
          { href: "/dashboard", label: "Projects" },
          { label: project.name },
        ]}
        status={archived ? <ProjectStatusBadge status={project.status} /> : null}
        description="Each review is one website your client checks. Open a review to set it up, share it, and follow its issues."
        secondaryActions={
          <ProjectActionsMenu
            projectId={project.id}
            projectName={project.name}
            status={project.status}
            version={project.version}
            canDelete={canDeleteProjects(auth.context)}
            readOnly={archived}
          />
        }
        primaryAction={
          archived ? undefined : (
            <CreateReviewDialog
              projectId={project.id}
              trigger={<Button type="button">Add review</Button>}
            />
          )
        }
      />
      <SuccessNotice notice={notice} />

      <div className="grid gap-8">
        {archived ? (
          <Alert>
            <Archive aria-hidden="true" />
            <AlertTitle>This project is archived</AlertTitle>
            <AlertDescription>
              Reviews are read-only. Restore the project from its menu to add or
              change reviews.
            </AlertDescription>
          </Alert>
        ) : null}

        {capacity ? (
          <ReviewLimitNotice capacity={capacity} isOwner={auth.context.role === "owner"} />
        ) : null}

        <SummaryStats
          label="Project overview"
          stats={[
            { label: "Reviews", value: project.reviewCount, icon: <Globe /> },
            {
              label: "Open issues",
              value: project.openIssueCount,
              icon: <CircleDot />,
            },
            {
              label: "Last activity",
              value: (
                <time
                  dateTime={project.updatedAt.toISOString()}
                  className="text-sm sm:text-lg"
                >
                  {formatRelativeActivity(project.updatedAt)}
                </time>
              ),
              hint: `Owner: ${project.ownerName}`,
              icon: <Clock />,
            },
          ]}
        />

        <section aria-labelledby="reviews-heading" className="grid gap-4">
          <h2 id="reviews-heading" className="type-section-title">
            Reviews
          </h2>
          <Suspense fallback={null}>
            <ReviewFilters
              initialQuery={filters.q}
              initialStatus={filters.status}
            />
          </Suspense>
          <Suspense fallback={<LoadingState label="Loading reviews" rows={3} />}>
            <ProjectReviewResults
              context={auth.context}
              projectId={project.id}
              projectArchived={archived}
              filters={filters}
            />
          </Suspense>
        </section>
      </div>
    </>
  );
}

async function ProjectReviewResults({
  context,
  projectId,
  projectArchived,
  filters,
}: {
  context: WorkspaceContext;
  projectId: string;
  projectArchived: boolean;
  filters: { q: string; status: ReviewStatusFilter };
}) {
  let reviews;
  try {
    reviews = await listProjectReviews(context, projectId, filters);
  } catch {
    return (
      <ErrorState
        title="We couldn’t load these reviews"
        description="Something went wrong while loading reviews. Try again in a moment."
      />
    );
  }

  if (!reviews) {
    return <PermissionDeniedState />;
  }

  const hasFilters = Boolean(filters.q.trim()) || filters.status !== "all";
  // Approval pills are helpful, not essential: the list still works without them.
  const approvalSummaries = await listReviewApprovalSummaries(
    context.workspaceId,
    reviews.map((review) => review.id),
  ).catch(() => undefined);

  return (
    <ReviewList
      approvalSummaries={approvalSummaries}
      projectId={projectId}
      reviews={reviews}
      hasFilters={hasFilters}
      canAddReview
      projectArchived={projectArchived}
    />
  );
}
