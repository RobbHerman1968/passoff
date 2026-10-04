import Link from "next/link";
import { FolderPlus, SearchX } from "lucide-react";

import { EmptyState } from "@/components/empty-state";
import { CreateProjectDialog } from "@/components/projects/create-project-dialog";
import { ProjectActionsMenu } from "@/components/projects/project-actions-menu";
import {
  ResourceList,
  ResourceListHeader,
  ResourceRow,
  ResourceRowTitle,
  ResourceTile,
} from "@/components/resource-list";
import { ProjectStatusBadge } from "@/components/workflow-status-badge";
import { Button } from "@/components/ui/button";
import {
  formatRelativeActivity,
  formatReviewCount,
  formatOpenIssueCount,
} from "@/lib/projects/format";
import type { ProjectListItem } from "@/lib/projects/service";
import { cn } from "@/lib/utils";

const COLUMNS = "md:grid-cols-[minmax(0,1fr)_8rem_9rem_8rem_2.75rem]";

export function ProjectList({
  projects,
  canDelete,
  hasFilters,
  statusFilter,
}: {
  projects: ProjectListItem[];
  canDelete: boolean;
  hasFilters: boolean;
  statusFilter: "active" | "archived" | "all";
}) {
  if (projects.length === 0 && !hasFilters) {
    if (statusFilter === "archived") {
      return (
        <EmptyState
          icon={<FolderPlus />}
          title="No archived projects"
          description="Archived projects stay here so you can restore them later."
          action={
            <Button asChild variant="outline">
              <Link href="/dashboard">Show active projects</Link>
            </Button>
          }
        />
      );
    }

    return (
      <EmptyState
        icon={<FolderPlus />}
        title="No projects yet"
        description="A project holds the websites you review for one client or launch. Create one to add your first review."
        action={
          <>
            <CreateProjectDialog
              trigger={<Button type="button">Create project</Button>}
            />
            <Button asChild variant="ghost">
              <Link href="/dashboard?status=archived">View archived projects</Link>
            </Button>
          </>
        }
      />
    );
  }

  if (projects.length === 0 && hasFilters) {
    return (
      <EmptyState
        icon={<SearchX />}
        title="No matching projects"
        description="Try a different name, or clear your filters to see all projects."
        action={
          <Button asChild variant="outline">
            <Link href="/dashboard">Clear filters</Link>
          </Button>
        }
      />
    );
  }

  return (
    <ResourceList
      label="Projects"
      header={
        <ResourceListHeader
          className={COLUMNS}
          columns={["Project", "Reviews", "Open issues", "Last activity", ""]}
        />
      }
    >
      {projects.map((project) => (
        <ResourceRow key={project.id} className={COLUMNS}>
          <div className="flex min-w-0 items-center gap-3">
            <ResourceTile label={project.name} />
            <div className="grid min-w-0 gap-0.5">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <ResourceRowTitle href={`/projects/${project.id}`}>
                  {project.name}
                </ResourceRowTitle>
                {project.status === "archived" ? (
                  <ProjectStatusBadge status={project.status} />
                ) : null}
              </div>
              <p className="truncate text-xs text-muted-foreground">
                Owner: {project.ownerName}
              </p>
            </div>
          </div>

          <dl className="col-span-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground md:col-span-3 md:grid md:grid-cols-subgrid md:items-center">
            <div>
              <dt className="sr-only">Reviews</dt>
              <dd>{formatReviewCount(project.reviewCount)}</dd>
            </div>
            <div>
              <dt className="sr-only">Open issues</dt>
              <dd
                className={cn(
                  project.openIssueCount > 0 && "font-medium text-foreground",
                )}
              >
                {formatOpenIssueCount(project.openIssueCount)}
              </dd>
            </div>
            <div>
              <dt className="sr-only">Last activity</dt>
              <dd>
                <time dateTime={project.updatedAt.toISOString()}>
                  {formatRelativeActivity(project.updatedAt)}
                </time>
              </dd>
            </div>
          </dl>

          <div className="relative z-10 col-start-2 row-start-1 justify-self-end md:col-start-auto md:row-start-auto">
            <ProjectActionsMenu
              projectId={project.id}
              projectName={project.name}
              status={project.status}
              version={project.version}
              canDelete={canDelete}
              readOnly={project.status === "archived"}
              triggerVariant="ghost"
            />
          </div>
        </ResourceRow>
      ))}
    </ResourceList>
  );
}
