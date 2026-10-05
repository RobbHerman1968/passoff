import * as React from "react";

import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { VersionChecker } from "@/components/version-checker";

export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <TooltipProvider delayDuration={200}>
      <VersionChecker />
      {children}
      <Toaster />
    </TooltipProvider>
  );
}
