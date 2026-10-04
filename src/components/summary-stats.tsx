import * as React from "react";

import { cn } from "@/lib/utils";

export type SummaryStat = {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  icon?: React.ReactNode;
};

export function SummaryStats({
  label,
  stats,
  className,
}: {
  label: string;
  stats: SummaryStat[];
  className?: string;
}) {
  return (
    <section aria-label={label} className={className}>
      <dl
        className={cn(
          "grid gap-2 sm:gap-3",
          stats.length >= 4
            ? "grid-cols-2 lg:grid-cols-4"
            : "grid-cols-3",
        )}
      >
        {stats.map((stat) => (
          <div
            key={stat.label}
            className="grid min-w-0 content-start gap-1 rounded-xl border border-border bg-card p-3 text-card-foreground sm:p-4"
          >
            <dt className="flex items-center gap-2 text-xs text-muted-foreground sm:text-sm [&_svg]:hidden [&_svg]:size-4 [&_svg]:shrink-0 sm:[&_svg]:block">
              {stat.icon ? <span aria-hidden="true">{stat.icon}</span> : null}
              {stat.label}
            </dt>
            <dd className="min-w-0 text-xl font-semibold break-words tracking-tight tabular-nums sm:text-2xl">
              {stat.value}
            </dd>
            {stat.hint ? (
              <dd className="hidden truncate text-xs text-muted-foreground sm:block">
                {stat.hint}
              </dd>
            ) : null}
          </div>
        ))}
      </dl>
    </section>
  );
}
