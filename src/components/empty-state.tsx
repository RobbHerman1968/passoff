import * as React from "react";

import { cn } from "@/lib/utils";

export function EmptyState({
  title,
  description,
  action,
  icon,
  headingLevel = 2,
  className,
}: {
  title: string;
  description: React.ReactNode;
  action?: React.ReactNode;
  icon?: React.ReactNode;
  headingLevel?: 2 | 3;
  className?: string;
}) {
  const Heading = `h${headingLevel}` as const;

  return (
    <div
      className={cn(
        "flex flex-col items-center gap-4 rounded-xl border border-dashed border-input/60 bg-card px-6 py-12 text-center text-card-foreground",
        className,
      )}
    >
      {icon ? (
        <div
          className="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground [&_svg]:size-6"
          aria-hidden="true"
        >
          {icon}
        </div>
      ) : null}
      <div className="grid max-w-md gap-1.5">
        <Heading className="type-section-title">{title}</Heading>
        <p className="type-supporting">{description}</p>
      </div>
      {action ? (
        <div className="flex flex-wrap justify-center gap-2">{action}</div>
      ) : null}
    </div>
  );
}
