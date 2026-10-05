"use client";

import { ChevronsUpDown, LogOut, Moon, Settings, Sun } from "lucide-react";
import { useState, useSyncExternalStore, useTransition } from "react";

import { useRouter } from "next/navigation";

import { signOutAction } from "@/app/(auth)/actions";
import { FormAlert } from "@/components/auth/form-alert";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { applyTheme, getResolvedTheme, subscribeTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";

export function getInitials(value: string): string {
  const words = value
    .replace(/@.*$/, "")
    .split(/[\s._-]+/)
    .filter(Boolean);
  const initials = words
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? "")
    .join("");
  return initials || "?";
}

export function Avatar({
  name,
  className,
}: {
  name: string;
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "flex size-8 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-semibold text-secondary-foreground ring-1 ring-border",
        className,
      )}
    >
      {getInitials(name)}
    </span>
  );
}

export function AccountMenu({
  name,
  email,
  variant = "compact",
}: {
  name: string;
  email?: string | null;
  variant?: "compact" | "sidebar";
}) {
  const router = useRouter();
  const theme = useSyncExternalStore(
    subscribeTheme,
    getResolvedTheme,
    () => "dark" as const,
  );
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const nextTheme = theme === "dark" ? "light" : "dark";

  function handleSignOut() {
    setError(null);
    startTransition(async () => {
      const result = await signOutAction();
      if (result.status === "error") {
        setError(result.message ?? "We couldn’t sign you out. Try again.");
      }
    });
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          {variant === "sidebar" ? (
            <Button
              type="button"
              variant="ghost"
              aria-label={`Account: ${name}`}
              className="h-auto min-h-12 w-full justify-start gap-3 px-2 py-2 text-left hover:bg-sidebar-accent"
            >
              <Avatar name={name} />
              <span className="grid min-w-0 flex-1">
                <span className="truncate text-sm font-medium text-sidebar-foreground">
                  {name}
                </span>
                {email && email !== name ? (
                  <span className="truncate text-xs text-muted-foreground">
                    {email}
                  </span>
                ) : null}
              </span>
              <ChevronsUpDown aria-hidden="true" className="text-muted-foreground" />
            </Button>
          ) : (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={`Account: ${name}`}
              className="rounded-full"
            >
              <Avatar name={name} />
            </Button>
          )}
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align={variant === "sidebar" ? "start" : "end"}
          side={variant === "sidebar" ? "top" : "bottom"}
          className="w-64"
        >
          <DropdownMenuLabel className="grid gap-0.5 py-2">
            <span className="truncate text-sm font-medium text-foreground">
              {name}
            </span>
            {email && email !== name ? (
              <span className="truncate text-xs font-normal text-muted-foreground">
                {email}
              </span>
            ) : null}
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => applyTheme(nextTheme)}>
            {theme === "dark" ? <Sun aria-hidden="true" /> : <Moon aria-hidden="true" />}
            {theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => {
              router.push("/settings/webhooks");
            }}
          >
            <Settings aria-hidden="true" />
            Webhooks
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem disabled={pending} onSelect={handleSignOut}>
            <LogOut aria-hidden="true" />
            {pending ? "Signing out…" : "Sign out"}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {error ? (
        <div className="fixed right-4 bottom-4 left-4 z-50 sm:left-auto sm:w-96">
          <FormAlert title="Sign out didn’t finish" description={error} />
        </div>
      ) : null}
    </>
  );
}
