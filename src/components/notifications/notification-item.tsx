import Link from "next/link";

import { Button } from "@/components/ui/button";
import {
  notificationCopy,
  type NotificationPayload,
  type NotificationType,
} from "@/lib/notifications/types";
import { formatRelativeActivity } from "@/lib/projects/format";
import { cn } from "@/lib/utils";

export function NotificationItem({
  id,
  type,
  createdAt,
  readAt,
  data,
  compact = false,
  onOpen,
}: {
  id: string;
  type: NotificationType;
  hrefPath: string;
  createdAt: Date | string;
  readAt: Date | string | null;
  data: NotificationPayload;
  compact?: boolean;
  onOpen?: (id: string) => void;
}) {
  const copy = notificationCopy(type, data, `/notifications/${id}`);
  const created = typeof createdAt === "string" ? new Date(createdAt) : createdAt;
  const unread = !readAt;

  return (
    <article
      className={cn(
        "grid min-w-0 gap-2 rounded-lg border border-border p-3",
        unread ? "bg-card" : "bg-muted/40",
      )}
    >
      <div className="flex min-w-0 items-start gap-2">
        <span
          className={cn(
            "mt-1.5 size-2 shrink-0 rounded-full",
            unread ? "bg-primary" : "bg-transparent ring-1 ring-border",
          )}
          aria-hidden="true"
        />
        <div className="grid min-w-0 flex-1 gap-1">
          <p className="text-sm font-medium break-words">{copy.title}</p>
          <p className="text-xs text-muted-foreground break-words">{copy.description}</p>
          <p className="text-xs text-muted-foreground">
            <span className="sr-only">{unread ? "Unread. " : "Read. "}</span>
            <time dateTime={created.toISOString()}>
              {formatRelativeActivity(created)}
            </time>
          </p>
        </div>
      </div>
      <div className={cn("flex flex-wrap gap-2", compact ? "pl-4" : "pl-4")}>
        <Button asChild size="sm">
          <Link
            href={`/notifications/${id}`}
            onClick={() => onOpen?.(id)}
          >
            {copy.action.label}
          </Link>
        </Button>
      </div>
    </article>
  );
}

export type { NotificationPayload, NotificationType };
