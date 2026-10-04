"use client";

import { Check, Search, X } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export type ListToolbarOption<T extends string> = { value: T; label: string };

const SEARCH_DELAY_MS = 300;

export function ListToolbar<T extends string>({
  label,
  searchId,
  searchLabel,
  searchPlaceholder,
  initialQuery = "",
  statusLegend,
  statusOptions,
  initialStatus,
  defaultStatus,
}: {
  label: string;
  searchId: string;
  searchLabel: string;
  searchPlaceholder: string;
  initialQuery?: string;
  statusLegend: string;
  statusOptions: ReadonlyArray<ListToolbarOption<T>>;
  initialStatus: T;
  defaultStatus: T;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [query, setQuery] = useState(initialQuery);
  const [syncedQuery, setSyncedQuery] = useState(initialQuery);
  const lastSubmitted = useRef(initialQuery.trim());

  if (initialQuery !== syncedQuery) {
    setSyncedQuery(initialQuery);
    setQuery(initialQuery);
  }

  function navigate(next: { q: string; status: T }) {
    const params = new URLSearchParams(searchParams.toString());
    const q = next.q.trim();
    lastSubmitted.current = q;

    if (q) params.set("q", q);
    else params.delete("q");

    if (next.status === defaultStatus) params.delete("status");
    else params.set("status", next.status);

    params.delete("notice");
    params.delete("type");
    startTransition(() => {
      const queryString = params.toString();
      router.replace(queryString ? `${pathname}?${queryString}` : pathname, {
        scroll: false,
      });
    });
  }

  useEffect(() => {
    if (query.trim() === lastSubmitted.current) return;
    const timer = window.setTimeout(() => {
      navigate({ q: query, status: initialStatus });
    }, SEARCH_DELAY_MS);
    return () => window.clearTimeout(timer);
    // navigate is recreated each render; the query is the only trigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  const hasFilters = Boolean(initialQuery.trim()) || initialStatus !== defaultStatus;

  return (
    <form
      role="search"
      aria-label={label}
      aria-busy={isPending}
      className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between"
      onSubmit={(event) => {
        event.preventDefault();
        navigate({ q: query, status: initialStatus });
      }}
    >
      <div className="grid min-w-0 gap-1.5 md:max-w-sm md:flex-1">
        <Label htmlFor={searchId}>{searchLabel}</Label>
        <div className="relative">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            id={searchId}
            name="q"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={searchPlaceholder}
            autoComplete="off"
            className="pl-9"
          />
        </div>
      </div>

      <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-end">
        <fieldset className="grid min-w-0 gap-1.5">
          <legend className="mb-1.5 text-sm font-medium">{statusLegend}</legend>
          <div className="flex max-w-full overflow-x-auto rounded-lg ring-1 ring-input ring-inset">
            {statusOptions.map((option) => {
              const selected = option.value === initialStatus;
              return (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={selected}
                  disabled={isPending}
                  onClick={() => navigate({ q: query, status: option.value })}
                  className={cn(
                    "inline-flex min-h-11 flex-1 shrink-0 items-center justify-center gap-1.5 sm:flex-none border-r border-input/40 px-3 text-sm whitespace-nowrap text-muted-foreground transition-colors outline-none last:border-r-0 first:rounded-l-lg last:rounded-r-lg hover:bg-muted hover:text-foreground focus-visible:z-10 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring disabled:opacity-60 motion-reduce:transition-none",
                    selected && "bg-secondary font-medium text-foreground",
                  )}
                >
                  {selected ? (
                    <Check aria-hidden="true" className="size-3.5" />
                  ) : null}
                  {option.label}
                </button>
              );
            })}
          </div>
        </fieldset>

        {hasFilters ? (
          <Button
            type="button"
            variant="ghost"
            disabled={isPending}
            onClick={() => {
              setQuery("");
              lastSubmitted.current = "";
              startTransition(() => router.replace(pathname, { scroll: false }));
            }}
          >
            <X data-icon="inline-start" aria-hidden="true" />
            Clear filters
          </Button>
        ) : null}
      </div>

      <p className="sr-only" role="status" aria-live="polite">
        {isPending ? "Updating results" : ""}
      </p>
    </form>
  );
}
