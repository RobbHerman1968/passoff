"use client";

import Link from "next/link";
import { useEffect } from "react";

export default function RoomError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f3f0ff] px-5 text-[var(--brand-deep)]">
      <div className="max-w-md text-center">
        <h1 className="font-[family-name:var(--font-display)] text-2xl font-semibold tracking-[-0.04em]">
          Approval room error
        </h1>
        <p className="mt-3 text-sm leading-6 text-black/50">
          This approval room could not be loaded. Try Again or go back to your dashboard.
        </p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            onClick={() => retry()}
            className="inline-flex h-10 items-center rounded-xl bg-[var(--brand)] px-4 text-sm font-semibold text-white"
          >
            Try Again
          </button>
          <Link
            href="/dashboard"
            className="inline-flex h-10 items-center rounded-xl px-4 text-sm font-semibold text-[var(--brand-ink)]"
          >
            Dashboard
          </Link>
        </div>
      </div>
    </main>
  );
}
