import type { Metadata } from "next";
import Link from "next/link";

import { LogoMark } from "@/components/logo";
import { Button } from "@/components/ui/button";

// The title is rendered in the page itself: a missing page has no route metadata to inherit.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function NotFound() {
  return (
    <main className="bg-background text-foreground flex min-h-dvh flex-col items-center justify-center px-4 py-10">
      <title>Page not found | Passoff</title>
      <div className="mb-8">
        <LogoMark width={40} height={25} className="text-foreground" />
      </div>
      <div className="mx-auto flex w-full max-w-md flex-col items-center gap-4 text-center">
        <h1 className="font-heading text-2xl font-semibold tracking-tight">
          We couldn’t find that page
        </h1>
        <p className="text-muted-foreground text-sm leading-relaxed">
          The link may be old, or the page may have moved or been removed. If someone sent you
          a review link, ask them for a new one.
        </p>
        <div className="flex flex-wrap justify-center gap-2">
          <Button asChild>
            <Link href="/dashboard">Go to your projects</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/">Go to Passoff home</Link>
          </Button>
        </div>
      </div>
    </main>
  );
}
