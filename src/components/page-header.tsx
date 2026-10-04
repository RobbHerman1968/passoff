import * as React from "react";

import {
  ProjectBreadcrumb,
  type BreadcrumbItem,
} from "@/components/projects/project-breadcrumb";
import { cn } from "@/lib/utils";

type HeadingLevel = 1 | 2 | 3;

export function PageHeader({
  title,
  description,
  status,
  breadcrumbs,
  primaryAction,
  secondaryActions,
  headingLevel = 1,
  className,
}: {
  title: string;
  description?: React.ReactNode;
  status?: React.ReactNode;
  breadcrumbs?: BreadcrumbItem[];
  primaryAction?: React.ReactNode;
  secondaryActions?: React.ReactNode;
  headingLevel?: HeadingLevel;
  className?: string;
}) {
  const Heading = `h${headingLevel}` as const;
  const hasActions = Boolean(primaryAction || secondaryActions);

  return (
    <div className={cn("grid gap-2 pb-6", className)}>
      {breadcrumbs?.length ? <ProjectBreadcrumb items={breadcrumbs} /> : null}
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="grid min-w-0 gap-1.5">
          <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
            <Heading className="type-page-title min-w-0 break-words">
              {title}
            </Heading>
            {status}
          </div>
          {description ? (
            <p className="type-supporting max-w-prose">{description}</p>
          ) : null}
        </div>
        {hasActions ? (
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {secondaryActions}
            {primaryAction}
          </div>
        ) : null}
      </header>
    </div>
  );
}
