"use client";

import Link from "next/link";
import { useEffect } from "react";

export default function ShareError({
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
    <main className="flex min-h-screen items-center justify-center bg-[#0f0d14] px-5 text-white">
      <div className="max-w-md text-center">
        <h1 className="font-[family-name:var(--font-display)] text-2xl font-semibold tracking-[-0.04em]">
          Review link error
        </h1>
        <p className="mt-3 text-sm leading-6 text-white/55">
          This review link could not be opened. Ask the workspace owner for a new link if the
          problem continues.
        </p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            onClick={() => retry()}
            className="inline-flex h-10 items-center rounded-xl bg-[#7c6cf0] px-4 text-sm font-semibold text-white"
          >
            Try again
          </button>
          <Link href="/" className="inline-flex h-10 items-center rounded-xl px-4 text-sm font-semibold text-white/70">
            Pass-Off home
          </Link>
        </div>
      </div>
    </main>
  );
}
