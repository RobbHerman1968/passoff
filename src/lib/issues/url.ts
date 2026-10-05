import type { IssueShowFilter } from "@/lib/issues/schemas";
import type { IssuePriority } from "@/lib/issues/statuses";

export type IssueListHrefState = {
  q?: string;
  show?: IssueShowFilter;
  priority?: IssuePriority;
  assignee?: string;
  page?: string;
  video?: boolean;
  p?: number;
  /** Pass `null` to drop the selected issue from the URL. */
  issue?: number | null;
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
  if (typeof filters.issue === "number" && filters.issue > 0) {
    params.set("issue", String(filters.issue));
  }

  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
}
