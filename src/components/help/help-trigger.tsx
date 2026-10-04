"use client";

import { CircleHelp } from "lucide-react";

import { useHelp } from "@/components/help/help-context";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { HelpTopicId } from "@/lib/help/topics";

export function HelpTrigger({
  topicId,
  className,
  placement = "header",
}: {
  topicId?: HelpTopicId;
  className?: string;
  placement?: "header" | "sidebar" | "edge";
}) {
  const { open, openHelp, closeHelp } = useHelp();

  function handleClick() {
    if (open) {
      closeHelp();
      return;
    }
    openHelp(topicId);
  }

  if (placement === "sidebar") {
    return (
      <Button
        type="button"
        variant="ghost"
        aria-expanded={open}
        aria-controls="help-drawer"
        className={cn(
          "min-h-11 w-full justify-start gap-3 px-3 font-medium text-sidebar-foreground hover:bg-sidebar-accent",
          className,
        )}
        onClick={handleClick}
      >
        <CircleHelp aria-hidden="true" className="text-muted-foreground" />
        Help
      </Button>
    );
  }

  if (placement === "header") {
    return (
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label="Help"
        aria-expanded={open}
        aria-controls="help-drawer"
        className={className}
        onClick={handleClick}
      >
        <CircleHelp />
      </Button>
    );
  }

  return (
    <button
      type="button"
      aria-expanded={open}
      aria-controls="help-drawer"
      className={cn(
        "fixed top-1/2 z-[60] flex min-h-11 min-w-11 -translate-y-1/2 items-center justify-center gap-2 border border-input bg-elevated px-2 py-3 text-sm font-medium text-elevated-foreground shadow-md outline-none transition-[right] duration-[var(--motion-duration)] ease-[var(--motion-ease)] hover:bg-muted focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 motion-reduce:transition-none",
        "rounded-l-lg border-r-0",
        open
          ? "right-0 max-sm:left-0 max-sm:right-auto max-sm:rounded-l-none max-sm:rounded-r-lg max-sm:border-r max-sm:border-l-0 sm:right-[28rem]"
          : "right-0",
        className,
      )}
      onClick={handleClick}
    >
      <span className="flex flex-col items-center gap-2">
        <CircleHelp className="size-4 shrink-0" aria-hidden="true" />
        <span
          className="text-xs font-medium tracking-wide uppercase"
          style={{ writingMode: "vertical-rl" }}
        >
          Help
        </span>
      </span>
    </button>
  );
}
