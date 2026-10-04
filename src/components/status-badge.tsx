import * as React from "react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  ISSUE_STATUS_LABELS,
  type IssueStatus,
} from "@/lib/issues/statuses";

export type StatusTone =
  | "open"
  | "in-progress"
  | "ready"
  | "positive"
  | "neutral"
  | "muted";

const toneClassName: Record<StatusTone, string> = {
  open: "bg-status-open/10 text-status-open ring-status-open/30",
  "in-progress":
    "bg-status-in-progress/10 text-status-in-progress ring-status-in-progress/30",
  ready:
    "bg-status-ready-for-review/10 text-status-ready-for-review ring-status-ready-for-review/30",
  positive: "bg-status-resolved/10 text-status-resolved ring-status-resolved/30",
  neutral: "bg-muted text-foreground ring-input/40",
  muted: "bg-muted text-muted-foreground ring-border",
};

/** Text-first status label. The dot is decorative; the words carry meaning. */
export function StatusPill({
  tone,
  children,
  className,
}: {
  tone: StatusTone;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Badge
      className={cn(
        "h-6 gap-1.5 rounded-full border-transparent px-2.5 text-xs font-medium ring-1 ring-inset",
        toneClassName[tone],
        className,
      )}
    >
      <span aria-hidden="true" className="size-1.5 rounded-full bg-current" />
      {children}
    </Badge>
  );
}

const ISSUE_STATUS_TONES: Record<IssueStatus, StatusTone> = {
  open: "open",
  in_progress: "in-progress",
  ready_for_verification: "ready",
  verified: "positive",
  closed: "muted",
};

export function StatusBadge({
  status,
  className,
}: {
  status: IssueStatus;
  className?: string;
}) {
  return (
    <StatusPill tone={ISSUE_STATUS_TONES[status]} className={className}>
      {ISSUE_STATUS_LABELS[status]}
    </StatusPill>
  );
}
