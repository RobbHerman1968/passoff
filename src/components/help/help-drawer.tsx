"use client";

import { useHelp } from "@/components/help/help-context";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

export function HelpDrawer() {
  const { open, setOpen, activeTopic, restoreFocus } = useHelp();

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetContent
        id="help-drawer"
        side="right"
        className="w-full gap-0 p-0 sm:max-w-md"
        aria-describedby="help-drawer-description"
        onCloseAutoFocus={restoreFocus}
      >
        <SheetHeader className="border-b border-border pr-14">
          <SheetTitle>{activeTopic.title}</SheetTitle>
          <SheetDescription id="help-drawer-description">
            Guidance for the current Passoff task.
          </SheetDescription>
        </SheetHeader>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          <ul className="grid list-disc gap-3 pl-5 text-sm text-foreground">
            {activeTopic.paragraphs.map((paragraph) => (
              <li key={paragraph}>{paragraph}</li>
            ))}
          </ul>
        </div>
      </SheetContent>
    </Sheet>
  );
}
