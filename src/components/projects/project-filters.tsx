"use client";

import { ListToolbar } from "@/components/list-toolbar";

const STATUS_OPTIONS = [
  { value: "active", label: "Active" },
  { value: "archived", label: "Archived" },
  { value: "all", label: "All" },
] as const;

type ProjectStatusFilter = (typeof STATUS_OPTIONS)[number]["value"];

export function ProjectFilters({
  initialQuery = "",
  initialStatus = "active",
}: {
  initialQuery?: string;
  initialStatus?: ProjectStatusFilter;
}) {
  return (
    <ListToolbar
      label="Search and filter projects"
      searchId="project-search"
      searchLabel="Search projects"
      searchPlaceholder="Project name"
      initialQuery={initialQuery}
      statusLegend="Show"
      statusOptions={STATUS_OPTIONS}
      initialStatus={initialStatus}
      defaultStatus="active"
    />
  );
}
