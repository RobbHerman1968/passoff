import { ArrowDown, ArrowUp, ChevronsUp, Minus, type LucideIcon } from "lucide-react";

import {
  ISSUE_PRIORITY_LABELS,
  type IssuePriority,
} from "@/lib/issues/statuses";
import { cn } from "@/lib/utils";

export const ISSUE_PRIORITY_ICONS: Record<IssuePriority, LucideIcon> = {
  low: ArrowDown,
  normal: Minus,
  high: ArrowUp,
  urgent: ChevronsUp,
};

export function IssuePriorityLabel({
  priority,
  className,
}: {
  priority: IssuePriority;
  className?: string;
}) {
  const Icon = ISSUE_PRIORITY_ICONS[priority];
  const label = ISSUE_PRIORITY_LABELS[priority];

  return (
    <span
      className={cn(
        "inline-flex min-w-0 items-center gap-1.5 text-sm text-foreground",
        className,
      )}
    >
      <Icon aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground" />
      <span className="truncate">{label}</span>
    </span>
  );
}
