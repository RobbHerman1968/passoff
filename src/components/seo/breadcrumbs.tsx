import Link from "next/link";

import type { BreadcrumbItem } from "@/lib/seo/types";

export function Breadcrumbs({ items }: { items: readonly BreadcrumbItem[] }) {
  return (
    <nav aria-label="Breadcrumb" className="print:mb-4">
      <ol className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[color-mix(in_srgb,var(--brand-deep)_55%,transparent)]">
        {items.map((item, index) => {
          const isLast = index === items.length - 1;
          return (
            <li key={`${item.href}-${item.name}`} className="flex min-w-0 items-center gap-2">
              {index > 0 ? (
                <span aria-hidden="true" className="text-[color-mix(in_srgb,var(--brand-deep)_30%,transparent)]">
                  /
                </span>
              ) : null}
              {isLast ? (
                <span aria-current="page" className="truncate font-medium text-[var(--brand-deep)]">
                  {item.name}
                </span>
              ) : (
                <Link href={item.href} className="truncate hover:text-[var(--brand-ink)] hover:underline">
                  {item.name}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
