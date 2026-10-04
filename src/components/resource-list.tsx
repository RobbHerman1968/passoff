import Link from "next/link";
import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * Dense, scannable rows for workspace objects (projects, reviews, issues).
 * Each row is one stretched link on its title; secondary controls sit above
 * it with `relative z-10` so they stay independently clickable.
 */
export function ResourceList({
  label,
  header,
  children,
  className,
}: {
  label: string;
  header?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  const rows = React.Children.toArray(children);

  return (
    <div
      className={cn(
        "overflow-hidden rounded-xl border border-border bg-card text-card-foreground",
        className,
      )}
    >
      {header}
      <ul aria-label={label} className="divide-y divide-border">
        {rows.map((row, index) => (
          <li key={React.isValidElement(row) && row.key ? row.key : index}>
            {row}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function ResourceListHeader({
  columns,
  className,
}: {
  columns: string[];
  className?: string;
}) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "hidden gap-4 border-b border-border bg-muted/50 px-4 py-2.5 text-xs font-medium text-muted-foreground md:grid",
        className,
      )}
    >
      {columns.map((column, index) => (
        <span key={`${column}-${index}`}>{column}</span>
      ))}
    </div>
  );
}

export function ResourceRow({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <article
      className={cn(
        "relative grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 px-4 py-3 transition-colors hover:bg-muted/40 has-[a[data-row-link]:focus-visible]:outline-2 has-[a[data-row-link]:focus-visible]:-outline-offset-2 has-[a[data-row-link]:focus-visible]:outline-ring motion-reduce:transition-none",
        className,
      )}
    >
      {children}
    </article>
  );
}

export function ResourceRowTitle({
  href,
  children,
  headingLevel = 2,
}: {
  href: string;
  children: React.ReactNode;
  headingLevel?: 2 | 3;
}) {
  const Heading = `h${headingLevel}` as const;
  return (
    <Heading className="min-w-0 truncate text-sm font-semibold">
      <Link
        href={href}
        data-row-link=""
        className="outline-none after:absolute after:inset-0 after:content-[''] hover:underline hover:underline-offset-4"
      >
        {children}
      </Link>
    </Heading>
  );
}

export function ResourceTile({
  label,
  className,
}: {
  label: string;
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-sm font-semibold text-primary ring-1 ring-primary/20 ring-inset",
        className,
      )}
    >
      {label.trim().charAt(0).toUpperCase() || "?"}
    </span>
  );
}
