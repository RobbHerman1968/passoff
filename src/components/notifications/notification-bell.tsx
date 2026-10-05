"use client";

import Link from "next/link";
import { Bell } from "lucide-react";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import {
  listRecentNotificationsAction,
  markAllNotificationsReadAction,
} from "@/app/(app)/notifications/actions";
import { NotificationItem } from "@/components/notifications/notification-item";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import type { NotificationListItem } from "@/lib/notifications/types";
import {
  formatUnreadCount,
  notificationsBellLabel,
} from "@/lib/notifications/types";

function Inbox({
  items,
  onMarkAll,
  onClose,
}: {
  items: NotificationListItem[];
  onMarkAll: () => void;
  onClose: () => void;
}) {
  return (
    <div className="grid gap-3">
      <p className="text-sm text-muted-foreground">
        Updates about assignments, verification, and approval.
      </p>
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          You’re all caught up. New work will show up here.
        </p>
      ) : (
        <div className="grid max-h-[min(24rem,70vh)] gap-2 overflow-y-auto">
          {items.slice(0, 8).map((item) => (
            <NotificationItem
              key={item.id}
              compact
              {...item}
              onOpen={onClose}
            />
          ))}
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" onClick={onMarkAll}>
          Mark all as read
        </Button>
        <Button asChild variant="ghost">
          <Link href="/notifications" onClick={onClose}>
            All notifications
          </Link>
        </Button>
      </div>
    </div>
  );
}

export function NotificationBell({ unreadCount }: { unreadCount: number }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [desktop, setDesktop] = useState(true);
  const [items, setItems] = useState<NotificationListItem[]>([]);
  const label = notificationsBellLabel(unreadCount);
  const badge = formatUnreadCount(unreadCount);

  useEffect(() => {
    const media = window.matchMedia("(min-width: 1024px)");
    const update = () => setDesktop(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  async function load() {
    const result = await listRecentNotificationsAction();
    if (result.ok) setItems(result.items);
  }

  async function markAll() {
    await markAllNotificationsReadAction();
    setItems((current) =>
      current.map((item) => ({ ...item, readAt: item.readAt ?? new Date() })),
    );
    router.refresh();
  }

  const trigger = (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      aria-label={label}
      className="relative"
    >
      <Bell aria-hidden="true" />
      {badge ? (
        <span className="absolute -top-0.5 -right-0.5 inline-flex min-h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[0.65rem] font-semibold text-primary-foreground">
          {badge}
        </span>
      ) : null}
    </Button>
  );

  const inbox = (
    <Inbox
      items={items}
      onMarkAll={() => void markAll()}
      onClose={() => setOpen(false)}
    />
  );

  if (desktop) {
    return (
      <Popover
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (next) void load();
        }}
      >
        <PopoverTrigger asChild>{trigger}</PopoverTrigger>
        <PopoverContent className="w-[min(24rem,calc(100vw-1.5rem))]">
          <p className="mb-3 text-sm font-medium">Notifications</p>
          {inbox}
        </PopoverContent>
      </Popover>
    );
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) void load();
      }}
    >
      <SheetTrigger asChild>{trigger}</SheetTrigger>
      <SheetContent side="right" className="w-[min(24rem,100%)]">
        <SheetHeader>
          <SheetTitle>Notifications</SheetTitle>
          <SheetDescription>
            Work that needs your attention in this workspace.
          </SheetDescription>
        </SheetHeader>
        <div className="mt-4">{inbox}</div>
      </SheetContent>
    </Sheet>
  );
}
