"use client";

import { ListToolbar } from "@/components/list-toolbar";
import {
  REVIEW_STATUS_LABELS,
  REVIEW_STATUSES,
} from "@/lib/projects/statuses";

type ReviewStatusFilter = "all" | "archived" | (typeof REVIEW_STATUSES)[number];

const STATUS_OPTIONS: ReadonlyArray<{ value: ReviewStatusFilter; label: string }> = [
  { value: "all", label: "All" },
  ...REVIEW_STATUSES.map((status) => ({
    value: status,
    label: REVIEW_STATUS_LABELS[status],
  })),
  { value: "archived", label: "Archived" },
];

export function ReviewFilters({
  initialQuery = "",
  initialStatus = "all",
}: {
  initialQuery?: string;
  initialStatus?: ReviewStatusFilter;
}) {
  return (
    <ListToolbar
      label="Search and filter reviews"
      searchId="review-search"
      searchLabel="Search reviews"
      searchPlaceholder="Review name"
      initialQuery={initialQuery}
      statusLegend="Show"
      statusOptions={STATUS_OPTIONS}
      initialStatus={initialStatus}
      defaultStatus="all"
    />
  );
}
