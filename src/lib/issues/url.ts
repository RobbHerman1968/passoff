import {
  parseIssueListSearchParams,
  type IssueListFilters,
  type IssueShowFilter,
} from "@/lib/issues/schemas";
import type { IssuePriority } from "@/lib/issues/statuses";

export type IssueListHrefState = {
  q?: string;
  show?: IssueShowFilter;
  priority?: IssuePriority;
  assignee?: string;
  page?: string;
  video?: boolean;
  p?: number;
};

export function buildIssueListHref(
  pathname: string,
  filters: IssueListHrefState,
): string {
  const params = new URLSearchParams();

  const q = filters.q?.trim() ?? "";
  if (q) params.set("q", q);

  if (filters.show && filters.show !== "active") {
    params.set("show", filters.show);
  }
  if (filters.priority) params.set("priority", filters.priority);
  if (filters.assignee) params.set("assignee", filters.assignee);
  if (filters.page) params.set("page", filters.page);
  if (filters.video) params.set("video", "1");
  if (filters.p && filters.p > 1) params.set("p", String(filters.p));

  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
}

export function reviewIssuesPath(projectId: string, reviewId: string): string {
  return `/projects/${projectId}/reviews/${reviewId}`;
}

export function issueDetailPath(
  projectId: string,
  reviewId: string,
  issueNumber: number,
): string {
  return `${reviewIssuesPath(projectId, reviewId)}/issues/${issueNumber}`;
}

/**
 * Build the detail URL and encode the current list query as a safe `return`
 * parameter so “Back to issues” can restore search, filters, and page.
 */
export function buildIssueDetailHref(
  projectId: string,
  reviewId: string,
  issueNumber: number,
  listFilters?: IssueListHrefState | IssueListFilters,
): string {
  const detailPath = issueDetailPath(projectId, reviewId, issueNumber);
  if (!listFilters) return detailPath;

  const listHref = buildIssueListHref(
    reviewIssuesPath(projectId, reviewId),
    listFilters,
  );
  const queryIndex = listHref.indexOf("?");
  if (queryIndex === -1) return detailPath;

  const returnQuery = listHref.slice(queryIndex + 1);
  if (!returnQuery) return detailPath;

  return `${detailPath}?return=${encodeURIComponent(returnQuery)}`;
}

/**
 * Resolve a `return` query value to an in-app issue-list URL for this review.
 * Unknown or unsafe values fall back to the unfiltered list path.
 */
export function resolveIssueListReturnHref(
  projectId: string,
  reviewId: string,
  returnParam: string | string[] | undefined,
): string {
  const listPath = reviewIssuesPath(projectId, reviewId);
  const raw = typeof returnParam === "string" ? returnParam : undefined;
  if (!raw) return listPath;

  // Reject absolute or protocol-relative destinations.
  if (
    raw.includes("://") ||
    raw.startsWith("//") ||
    raw.startsWith("/") ||
    raw.includes("\\")
  ) {
    return listPath;
  }

  const params = new URLSearchParams(raw);
  const filters = parseIssueListSearchParams({
    q: params.get("q") ?? undefined,
    show: params.get("show") ?? undefined,
    priority: params.get("priority") ?? undefined,
    assignee: params.get("assignee") ?? undefined,
    page: params.get("page") ?? undefined,
    video: params.get("video") ?? undefined,
    p: params.get("p") ?? undefined,
  });

  return buildIssueListHref(listPath, filters);
}

export function parseIssueNumberParam(value: string): number | null {
  if (!/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) return null;
  return parsed;
}
