import { StatusPill, type StatusTone } from "@/components/status-badge";
import {
  PROJECT_STATUS_LABELS,
  REVIEW_STATUS_LABELS,
  type ProjectStatus,
  type ReviewStatus,
} from "@/lib/projects/statuses";

const projectStatusTone: Record<ProjectStatus, StatusTone> = {
  active: "positive",
  archived: "muted",
};

const reviewStatusTone: Record<ReviewStatus, StatusTone> = {
  draft: "neutral",
  open: "open",
  closed: "muted",
};

export function ProjectStatusBadge({
  status,
  className,
}: {
  status: ProjectStatus;
  className?: string;
}) {
  return (
    <StatusPill tone={projectStatusTone[status]} className={className}>
      {PROJECT_STATUS_LABELS[status]}
    </StatusPill>
  );
}

export function ReviewStatusBadge({
  status,
  archived,
  className,
}: {
  status: ReviewStatus;
  archived?: boolean;
  className?: string;
}) {
  if (archived) {
    return (
      <StatusPill tone="muted" className={className}>
        Archived
      </StatusPill>
    );
  }

  return (
    <StatusPill tone={reviewStatusTone[status]} className={className}>
      {REVIEW_STATUS_LABELS[status]}
    </StatusPill>
  );
}
