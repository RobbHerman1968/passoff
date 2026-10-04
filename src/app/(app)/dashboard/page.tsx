import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { CircleDot, FolderKanban, Globe } from "lucide-react";
import { Suspense } from "react";

import { ErrorState } from "@/components/error-state";
import { LoadingState } from "@/components/loading-state";
import { PageHeader } from "@/components/page-header";
import { DashboardCreateProjectButton } from "@/components/projects/dashboard-create-project-button";
import { ProjectFilters } from "@/components/projects/project-filters";
import { ProjectList } from "@/components/projects/project-list";
import { SuccessNotice } from "@/components/success-notice";
import { SummaryStats } from "@/components/summary-stats";
import { projectListFiltersSchema } from "@/lib/projects/schemas";
import { listProjects } from "@/lib/projects/service";
import {
  canDeleteProjects,
  requireWorkspaceContext,
  type WorkspaceContext,
} from "@/lib/workspaces/context";

export const metadata: Metadata = {
  title: "Projects",
  description: "Your Passoff projects and reviews.",
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
type ProjectFilterValues = { q: string; status: "active" | "archived" | "all" };

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const auth = await requireWorkspaceContext();
  if (!auth.ok) {
    if (auth.reason === "unauthenticated") {
      redirect("/sign-in?callbackUrl=/dashboard");
    }
    redirect("/onboarding");
  }

  const params = await searchParams;
  const parsedFilters = projectListFiltersSchema.safeParse({
    q: typeof params.q === "string" ? params.q : "",
    status: typeof params.status === "string" ? params.status : "active",
  });
  const filters: ProjectFilterValues = parsedFilters.success
    ? parsedFilters.data
    : { q: "", status: "active" };
  const notice = typeof params.notice === "string" ? params.notice : undefined;

  return (
    <Suspense fallback={<LoadingState label="Loading projects" withHeader />}>
      <DashboardProjectResults
        context={auth.context}
        filters={filters}
        notice={notice}
      />
    </Suspense>
  );
}

async function DashboardProjectResults({
  context,
  filters,
  notice,
}: {
  context: WorkspaceContext;
  filters: ProjectFilterValues;
  notice?: string;
}) {
  const hasFilters = Boolean(filters.q.trim()) || filters.status !== "active";
  let projects;
  try {
    projects = await listProjects(context, filters);
  } catch {
    return (
      <>
        <DashboardHeader workspaceName={context.workspaceName} showAction />
        <ErrorState
          title="We couldn’t load your projects"
          description="Something went wrong while loading your projects. Try again in a moment."
        />
      </>
    );
  }

  const showOverview = !hasFilters && projects.length > 0;
  const reviewTotal = projects.reduce((sum, p) => sum + p.reviewCount, 0);
  const openIssueTotal = projects.reduce((sum, p) => sum + p.openIssueCount, 0);

  return (
    <>
      <DashboardHeader
        workspaceName={context.workspaceName}
        showAction={projects.length > 0 || hasFilters}
      />
      <SuccessNotice notice={notice} />
      <div className="grid gap-6">
        {showOverview ? (
          <SummaryStats
            label="Workspace overview"
            stats={[
              {
                label: "Active projects",
                value: projects.length,
                icon: <FolderKanban />,
              },
              { label: "Reviews", value: reviewTotal, icon: <Globe /> },
              {
                label: "Open issues",
                value: openIssueTotal,
                hint:
                  openIssueTotal === 0
                    ? "Nothing waiting on your team"
                    : "Across all active projects",
                icon: <CircleDot />,
              },
            ]}
          />
        ) : null}
        {projects.length > 0 || hasFilters ? (
          <Suspense fallback={null}>
            <ProjectFilters
              initialQuery={filters.q}
              initialStatus={filters.status}
            />
          </Suspense>
        ) : null}
        <ProjectList
          projects={projects}
          canDelete={canDeleteProjects(context)}
          hasFilters={hasFilters}
          statusFilter={filters.status}
        />
      </div>
    </>
  );
}

function DashboardHeader({
  workspaceName,
  showAction,
}: {
  workspaceName: string;
  showAction: boolean;
}) {
  return (
    <PageHeader
      title="Projects"
      description={`Everything ${workspaceName} is reviewing, one project per client or launch.`}
      primaryAction={showAction ? <DashboardCreateProjectButton /> : undefined}
    />
  );
}
