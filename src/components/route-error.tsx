"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { AlertCircle } from "lucide-react";

import { Button } from "@/components/ui/button";

/**
 * Shown when a page fails unexpectedly. It never shows the underlying error. The short
 * reference is a hash that support can match to a server log without seeing any customer
 * content.
 */
export function RouteError({
  digest,
  onRetry,
  homeHref = "/",
  homeLabel = "Go to Passoff home",
}: {
  digest?: string;
  onRetry: () => void;
  homeHref?: string;
  homeLabel?: string;
}) {
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    // Move focus to the explanation so keyboard and screen-reader users hear it.
    headingRef.current?.focus();
  }, []);

  return (
    <main className="bg-background text-foreground flex min-h-dvh flex-col items-center justify-center px-4 py-10">
      <title>Something went wrong | Passoff</title>
      <div className="mx-auto flex w-full max-w-md flex-col items-center gap-4 text-center">
        <div
          className="bg-muted text-muted-foreground flex size-12 items-center justify-center rounded-full"
          aria-hidden="true"
        >
          <AlertCircle className="size-6" />
        </div>
        <h1
          ref={headingRef}
          tabIndex={-1}
          className="font-heading text-2xl font-semibold tracking-tight outline-none"
        >
          We couldn’t load this page
        </h1>
        <p className="text-muted-foreground text-sm leading-relaxed">
          Something went wrong on our side. Your work is saved. Try again, or head back and
          pick up where you left off.
        </p>
        <div className="flex flex-wrap justify-center gap-2">
          <Button type="button" onClick={onRetry}>
            Try again
          </Button>
          <Button asChild variant="outline">
            <Link href={homeHref}>{homeLabel}</Link>
          </Button>
        </div>
        {digest ? (
          <p className="text-muted-foreground text-xs">
            If this keeps happening, tell support this reference: <code>{digest}</code>
          </p>
        ) : null}
      </div>
    </main>
  );
}
