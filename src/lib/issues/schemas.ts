import { z } from "zod";

import { ISSUE_PRIORITIES } from "@/lib/issues/statuses";

export const ISSUE_SHOW_FILTERS = [
  "active",
  "all",
  "verified",
  "closed",
] as const;
export type IssueShowFilter = (typeof ISSUE_SHOW_FILTERS)[number];

export const ISSUE_LIST_PAGE_SIZE = 50;

const emptyToUndefined = (value: unknown) => {
  if (value === undefined || value === null) return undefined;
  if (typeof value === "string" && value.trim() === "") return undefined;
  return value;
};

/**
 * Normalize and validate issue-list URL state. Invalid values are ignored
 * so a shared or stale link still loads a safe default view.
 */
export const issueListFiltersSchema = z.object({
  q: z.preprocess(
    (value) => (typeof value === "string" ? value : ""),
    z.string().trim().max(120).default(""),
  ),
  show: z.preprocess(
    emptyToUndefined,
    z.enum(ISSUE_SHOW_FILTERS).default("active"),
  ),
  priority: z.preprocess(
    emptyToUndefined,
    z.enum(ISSUE_PRIORITIES).optional(),
  ),
  assignee: z.preprocess(emptyToUndefined, z.string().trim().max(80).optional()),
  page: z.preprocess(emptyToUndefined, z.string().trim().max(500).optional()),
  video: z.preprocess((value) => {
    if (value === "1" || value === "true" || value === true) return true;
    return undefined;
  }, z.boolean().optional()),
  issue: z.preprocess((value) => {
    if (typeof value !== "string" && typeof value !== "number") return undefined;
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < 1) return undefined;
    return parsed;
  }, z.number().int().positive().optional()),
  p: z.preprocess((value) => {
    if (typeof value !== "string" && typeof value !== "number") return 1;
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < 1) return 1;
    return parsed;
  }, z.number().int().positive().default(1)),
});

export type IssueListFilters = z.infer<typeof issueListFiltersSchema>;

export function parseIssueListSearchParams(
  params: Record<string, string | string[] | undefined>,
): IssueListFilters {
  const raw = {
    q: typeof params.q === "string" ? params.q : "",
    show: typeof params.show === "string" ? params.show : undefined,
    priority: typeof params.priority === "string" ? params.priority : undefined,
    assignee: typeof params.assignee === "string" ? params.assignee : undefined,
    page: typeof params.page === "string" ? params.page : undefined,
    video: typeof params.video === "string" ? params.video : undefined,
    issue: typeof params.issue === "string" ? params.issue : undefined,
    p: typeof params.p === "string" ? params.p : undefined,
  };

  const parsed = issueListFiltersSchema.safeParse(raw);
  if (parsed.success) {
    return parsed.data;
  }

  return {
    q: "",
    show: "active",
    p: 1,
  };
}

export function issueListHasActiveFilters(filters: IssueListFilters): boolean {
  return Boolean(
    filters.q.trim() ||
      filters.show !== "active" ||
      filters.priority ||
      filters.assignee ||
      filters.page ||
      filters.video,
  );
}
