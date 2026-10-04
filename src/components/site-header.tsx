"use client";

import Link from "next/link";
import { Menu } from "lucide-react";
import * as React from "react";

import { Logo } from "@/components/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { authRoutes, publicNavItems } from "@/lib/site";

export function SiteHeader() {
  const [navOpen, setNavOpen] = React.useState(false);

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-site-header backdrop-blur-md">
      <div className="site-shell flex h-16 items-center gap-2 sm:gap-3">
        <Sheet open={navOpen} onOpenChange={setNavOpen}>
          <SheetTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="lg:hidden"
              aria-label="Open navigation"
            >
              <Menu />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-[min(20rem,100%)] p-0">
            <SheetHeader className="border-b border-border">
              <SheetTitle>Passoff</SheetTitle>
              <SheetDescription>
                Choose a section or start a review.
              </SheetDescription>
            </SheetHeader>
            <nav aria-label="Main navigation" className="grid gap-1 p-3">
              {publicNavItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setNavOpen(false)}
                  className="flex min-h-11 items-center rounded-lg px-3 text-sm font-medium text-foreground hover:bg-muted"
                >
                  {item.label}
                </Link>
              ))}
            </nav>
            <div className="mt-auto grid gap-3 border-t border-border p-4">
              <Button asChild size="lg">
                <Link href={authRoutes.signUp} onClick={() => setNavOpen(false)}>
                  Start a review
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link href={authRoutes.signIn} onClick={() => setNavOpen(false)}>
                  Sign in
                </Link>
              </Button>
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm text-muted-foreground">Appearance</p>
                <ThemeToggle variant="ghost" size="icon" />
              </div>
            </div>
          </SheetContent>
        </Sheet>

        <Link
          href="/"
          aria-label="Passoff home"
          className="min-w-0 rounded-md text-foreground focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
        >
          <Logo className="flex items-center gap-2.5" />
        </Link>

        <nav aria-label="Main navigation" className="ml-6 hidden items-center lg:flex">
          {publicNavItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="flex min-h-11 items-center rounded-lg px-3 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-1 sm:gap-2">
          <Link
            href={authRoutes.signIn}
            className="hidden min-h-11 items-center rounded-lg px-3 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground sm:inline-flex"
          >
            Sign in
          </Link>
          <Button asChild className="max-sm:px-3">
            <Link href={authRoutes.signUp}>
              Start a review
            </Link>
          </Button>
          <ThemeToggle variant="ghost" size="icon" className="max-lg:hidden" />
        </div>
      </div>
    </header>
  );
}
