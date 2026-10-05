"use client";

import { Check, Filter, Search, X } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import type { IssueListFacets } from "@/lib/issues/list";
import {
  ISSUE_SHOW_FILTERS,
  type IssueListFilters,
  type IssueShowFilter,
} from "@/lib/issues/schemas";
import {
  ISSUE_PRIORITY_LABELS,
  type IssuePriority,
} from "@/lib/issues/statuses";
import { buildIssueListHref } from "@/lib/issues/url";
import { cn } from "@/lib/utils";

const SEARCH_DELAY_MS = 300;

const SHOW_LABELS: Record<IssueShowFilter, string> = {
  active: "Active",
  all: "All",
  verified: "Verified",
  closed: "Closed",
};

type Chip = {
  key: string;
  label: string;
  clear: Partial<IssueListFilters>;
};

function buildChips(
  filters: IssueListFilters,
  facets: IssueListFacets,
): Chip[] {
  const chips: Chip[] = [];

  if (filters.q.trim()) {
    chips.push({
      key: "q",
      label: `Search: ${filters.q.trim()}`,
      clear: { q: "" },
    });
  }
  if (filters.show !== "active") {
    chips.push({
      key: "show",
      label: `Show: ${SHOW_LABELS[filters.show]}`,
      clear: { show: "active" },
    });
  }
  if (filters.priority) {
    chips.push({
      key: "priority",
      label: `Priority: ${ISSUE_PRIORITY_LABELS[filters.priority]}`,
      clear: { priority: undefined },
    });
  }
  if (filters.assignee === "unassigned") {
    chips.push({
      key: "assignee",
      label: "Assignee: Unassigned",
      clear: { assignee: undefined },
    });
  } else if (filters.assignee) {
    const name =
      facets.assignees.find((item) => item.userId === filters.assignee)
        ?.displayName ?? "Assignee";
    chips.push({
      key: "assignee",
      label: `Assignee: ${name}`,
      clear: { assignee: undefined },
    });
  }
  if (filters.page) {
    chips.push({
      key: "page",
      label: `Page: ${filters.page}`,
      clear: { page: undefined },
    });
  }
  if (filters.video) {
    chips.push({
      key: "video",
      label: "Has video",
      clear: { video: undefined },
    });
  }

  return chips;
}

export function IssueListFilters({
  filters,
  facets,
}: {
  filters: IssueListFilters;
  facets: IssueListFacets;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();
  const [query, setQuery] = useState(filters.q);
  const [syncedQuery, setSyncedQuery] = useState(filters.q);
  const lastSubmitted = useRef(filters.q.trim());
  const [sheetOpen, setSheetOpen] = useState(false);
  const [draftPriority, setDraftPriority] = useState(filters.priority);
  const [draftAssignee, setDraftAssignee] = useState(filters.assignee);
  const [draftPage, setDraftPage] = useState(filters.page);
  const [draftVideo, setDraftVideo] = useState(Boolean(filters.video));

  if (filters.q !== syncedQuery) {
    setSyncedQuery(filters.q);
    setQuery(filters.q);
  }

  const showPriorityFilter = facets.priorities.length > 1;
  // Only expose assignee filtering once at least one issue is assigned.
  const showAssigneeFilter = facets.assignees.length > 0;
  const showPageFilter = facets.pages.length > 0;
  const showVideoFilter = facets.hasVideo;
  const hasExtraFilters =
    showPriorityFilter || showAssigneeFilter || showPageFilter || showVideoFilter;

  function navigate(next: Partial<IssueListFilters>) {
    const merged = {
      ...filters,
      ...next,
      p:
        next.q !== undefined ||
        next.show !== undefined ||
        next.priority !== undefined ||
        next.assignee !== undefined ||
        next.page !== undefined ||
        next.video !== undefined
          ? (next.p ?? 1)
          : (next.p ?? filters.p),
    };

    startTransition(() => {
      router.replace(buildIssueListHref(pathname, merged), { scroll: false });
    });
  }

  useEffect(() => {
    if (query.trim() === lastSubmitted.current) return;
    const timer = window.setTimeout(() => {
      lastSubmitted.current = query.trim();
      navigate({ q: query });
    }, SEARCH_DELAY_MS);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  const chips = buildChips(filters, facets);
  const hasFilters = chips.length > 0;

  return (
    <div className="grid gap-3">
      <form
        role="search"
        aria-label="Search and filter issues"
        aria-busy={isPending}
        className="flex flex-col gap-3 lg:flex-row lg:items-end"
        onSubmit={(event) => {
          event.preventDefault();
          lastSubmitted.current = query.trim();
          navigate({ q: query });
        }}
      >
        <div className="grid min-w-0 flex-1 gap-1.5">
          <Label htmlFor="issue-search">Search issues</Label>
          <div className="relative">
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              id="issue-search"
              name="q"
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Number, text, page, or route"
              autoComplete="off"
              className="pl-9"
            />
          </div>
        </div>

        <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-end lg:shrink-0">
          <fieldset className="grid min-w-0 gap-1.5">
            <legend className="mb-1.5 text-sm font-medium">Show</legend>
            <div className="flex max-w-full overflow-x-auto rounded-lg ring-1 ring-input ring-inset">
              {ISSUE_SHOW_FILTERS.map((option) => {
                const selected = option === filters.show;
                return (
                  <button
                    key={option}
                    type="button"
                    aria-pressed={selected}
                    disabled={isPending}
                    onClick={() => navigate({ show: option })}
                    className={cn(
                      "inline-flex min-h-11 flex-1 shrink-0 items-center justify-center gap-1.5 border-r border-input/40 px-3 text-sm whitespace-nowrap text-muted-foreground transition-colors outline-none first:rounded-l-lg last:rounded-r-lg last:border-r-0 hover:bg-muted hover:text-foreground focus-visible:z-10 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring disabled:opacity-60 sm:flex-none motion-reduce:transition-none",
                      selected && "bg-secondary font-medium text-foreground",
                    )}
                  >
                    {selected ? (
                      <Check aria-hidden="true" className="size-3.5" />
                    ) : null}
                    {SHOW_LABELS[option]}
                  </button>
                );
              })}
            </div>
          </fieldset>

          {hasExtraFilters ? (
            <Sheet
              open={sheetOpen}
              onOpenChange={(open) => {
                setSheetOpen(open);
                if (open) {
                  setDraftPriority(filters.priority);
                  setDraftAssignee(filters.assignee);
                  setDraftPage(filters.page);
                  setDraftVideo(Boolean(filters.video));
                }
              }}
            >
              <SheetTrigger asChild>
                <Button type="button" variant="outline" disabled={isPending}>
                  <Filter data-icon="inline-start" aria-hidden="true" />
                  Filters
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="flex flex-col gap-0 p-0">
                <SheetHeader className="border-b border-border p-4">
                  <SheetTitle>Filter issues</SheetTitle>
                  <SheetDescription>
                    Narrow the list by priority, assignee, page, or video.
                  </SheetDescription>
                </SheetHeader>
                <div className="grid flex-1 gap-5 overflow-y-auto p-4">
                  {showPriorityFilter ? (
                    <fieldset className="grid gap-2">
                      <legend className="text-sm font-medium">Priority</legend>
                      <div className="grid gap-2">
                        <FilterOption
                          selected={!draftPriority}
                          onSelect={() => setDraftPriority(undefined)}
                          label="Any priority"
                        />
                        {facets.priorities.map((priority) => (
                          <FilterOption
                            key={priority}
                            selected={draftPriority === priority}
                            onSelect={() => setDraftPriority(priority)}
                            label={ISSUE_PRIORITY_LABELS[priority as IssuePriority]}
                          />
                        ))}
                      </div>
                    </fieldset>
                  ) : null}

                  {showAssigneeFilter ? (
                    <fieldset className="grid gap-2">
                      <legend className="text-sm font-medium">Assignee</legend>
                      <div className="grid gap-2">
                        <FilterOption
                          selected={!draftAssignee}
                          onSelect={() => setDraftAssignee(undefined)}
                          label="Anyone"
                        />
                        {facets.hasUnassigned ? (
                          <FilterOption
                            selected={draftAssignee === "unassigned"}
                            onSelect={() => setDraftAssignee("unassigned")}
                            label="Unassigned"
                          />
                        ) : null}
                        {facets.assignees.map((assignee) => (
                          <FilterOption
                            key={assignee.userId}
                            selected={draftAssignee === assignee.userId}
                            onSelect={() => setDraftAssignee(assignee.userId)}
                            label={assignee.displayName}
                          />
                        ))}
                      </div>
                    </fieldset>
                  ) : null}

                  {showPageFilter ? (
                    <fieldset className="grid gap-2">
                      <legend className="text-sm font-medium">Page</legend>
                      <div className="grid gap-2">
                        <FilterOption
                          selected={!draftPage}
                          onSelect={() => setDraftPage(undefined)}
                          label="Any page"
                        />
                        {facets.pages.map((page) => (
                          <FilterOption
                            key={page.route}
                            selected={draftPage === page.route}
                            onSelect={() => setDraftPage(page.route)}
                            label={page.title ? `${page.title} (${page.route})` : page.route}
                          />
                        ))}
                      </div>
                    </fieldset>
                  ) : null}

                  {showVideoFilter ? (
                    <fieldset className="grid gap-2">
                      <legend className="text-sm font-medium">Video</legend>
                      <FilterOption
                        selected={draftVideo}
                        onSelect={() => setDraftVideo((value) => !value)}
                        label="Has video"
                      />
                    </fieldset>
                  ) : null}
                </div>
                <SheetFooter className="border-t border-border p-4">
                  <Button
                    type="button"
                    onClick={() => {
                      navigate({
                        priority: draftPriority,
                        assignee: draftAssignee,
                        page: draftPage,
                        video: draftVideo || undefined,
                      });
                      setSheetOpen(false);
                    }}
                  >
                    Apply filters
                  </Button>
                  <SheetClose asChild>
                    <Button type="button" variant="outline">
                      Cancel
                    </Button>
                  </SheetClose>
                </SheetFooter>
              </SheetContent>
            </Sheet>
          ) : null}

          {hasFilters ? (
            <Button
              type="button"
              variant="ghost"
              disabled={isPending}
              onClick={() => {
                setQuery("");
                lastSubmitted.current = "";
                startTransition(() => {
                  router.replace(pathname, { scroll: false });
                });
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

      {chips.length > 0 ? (
        <ul aria-label="Active filters" className="flex flex-wrap gap-2">
          {chips.map((chip) => (
            <li key={chip.key}>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                className="min-h-11 gap-1.5"
                disabled={isPending}
                onClick={() => navigate(chip.clear)}
              >
                <span className="max-w-[16rem] truncate">{chip.label}</span>
                <X aria-hidden="true" className="size-3.5" />
                <span className="sr-only">Remove {chip.label}</span>
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function FilterOption({
  selected,
  onSelect,
  label,
}: {
  selected: boolean;
  onSelect: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onSelect}
      className={cn(
        "inline-flex min-h-11 items-center justify-between gap-3 rounded-lg border border-input px-3 text-left text-sm outline-none hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
        selected && "border-ring bg-secondary font-medium",
      )}
    >
      <span className="min-w-0 truncate">{label}</span>
      {selected ? <Check aria-hidden="true" className="size-4 shrink-0" /> : null}
    </button>
  );
}
