"use client";

import { Moon, Sun } from "lucide-react";
import { useSyncExternalStore } from "react";

import { Button } from "@/components/ui/button";
import {
  applyTheme,
  getResolvedTheme,
  subscribeTheme,
} from "@/lib/theme";

export function ThemeToggle({
  variant = "outline",
  size = "icon-lg",
  className,
}: {
  variant?: "outline" | "ghost";
  size?: "icon" | "icon-lg";
  className?: string;
}) {
  const theme = useSyncExternalStore(
    subscribeTheme,
    getResolvedTheme,
    () => "dark" as const,
  );

  function toggleTheme() {
    applyTheme(theme === "dark" ? "light" : "dark");
  }

  const label = theme === "dark" ? "Switch to light mode" : "Switch to dark mode";

  return (
    <Button
      type="button"
      variant={variant}
      size={size}
      className={className}
      onClick={toggleTheme}
      aria-label={label}
      title={label}
    >
      {theme === "dark" ? <Sun /> : <Moon />}
    </Button>
  );
}
