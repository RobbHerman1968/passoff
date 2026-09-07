"use client";

import { useState } from "react";

export function CopyableBlock({
  label,
  body,
}: {
  label: string;
  body: string;
}) {
  const [copied, setCopied] = useState(false);

  async function onCopy() {
    try {
      await navigator.clipboard.writeText(body);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-[color-mix(in_srgb,var(--brand-ink)_12%,transparent)] bg-white">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[color-mix(in_srgb,var(--brand-ink)_10%,transparent)] bg-[#faf8ff] px-4 py-3 print:hidden">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--brand)]">
          Template
        </p>
        <button
          type="button"
          onClick={onCopy}
          className="inline-flex h-9 items-center rounded-lg bg-[var(--brand-surface)] px-3 text-xs font-semibold text-[var(--brand-soft)] transition hover:bg-[var(--brand-deep)]"
        >
          {copied ? "Copied" : label}
        </button>
      </div>
      <pre className="max-w-full overflow-x-auto whitespace-pre-wrap break-words px-4 py-4 font-[family-name:var(--font-figtree)] text-sm leading-7 text-[color-mix(in_srgb,var(--brand-deep)_78%,transparent)]">
        {body}
      </pre>
    </div>
  );
}
