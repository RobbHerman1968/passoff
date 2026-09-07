"use client";

import { useId, useState } from "react";
import { Check, Copy, ShieldCheck } from "lucide-react";

import type { ApprovalReceiptView } from "@/lib/rooms/approval-receipt";
import { toast } from "@/components/ui/toast";

function formatApprovedAt(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

type ApprovalReceiptProps = {
  receipt: ApprovalReceiptView;
  /** Compact rail variant vs full card. */
  variant?: "card" | "compact";
  className?: string;
};

export function ApprovalReceipt({
  receipt,
  variant = "card",
  className = "",
}: ApprovalReceiptProps) {
  const digestId = useId();
  const [digestExpanded, setDigestExpanded] = useState(false);
  const isApproved = receipt.decision === "approved";
  const padding = variant === "compact" ? "p-3" : "p-4 sm:p-5";

  async function copyText(label: string, value: string) {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(`${label} copied.`);
    } catch {
      toast.error(`Could not copy ${label.toLowerCase()}.`);
    }
  }

  return (
    <article
      className={`rounded-2xl border ${
        isApproved
          ? "border-emerald-200/90 bg-emerald-50/90"
          : "border-amber-200/90 bg-amber-50/80"
      } ${padding} ${className}`}
      aria-label={`Approval receipt ${receipt.referenceId}`}
    >
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span
              className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] ${
                isApproved
                  ? "bg-emerald-700 text-white"
                  : "bg-amber-800 text-white"
              }`}
            >
              {isApproved ? <ShieldCheck className="size-3.5" aria-hidden /> : null}
              {receipt.statusLabel}
            </span>
            {receipt.supersededAt ? (
              <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-black/40">
                Superseded
              </span>
            ) : null}
          </div>
          <h3 className="mt-2 truncate font-[family-name:var(--font-display)] text-base font-semibold tracking-[-0.03em] text-[var(--brand-deep)] sm:text-lg">
            {receipt.projectName}
          </h3>
          <p className="mt-0.5 text-xs text-black/55">
            {receipt.clientName} · Revision {receipt.revisionNumber}
          </p>
        </div>
        <p className="shrink-0 font-mono text-[11px] font-semibold text-black/45">
          <span className="sr-only">Reference ID </span>
          {receipt.referenceId}
        </p>
      </header>

      <dl className="mt-4 grid gap-3 text-xs sm:grid-cols-2">
        <div>
          <dt className="text-[10px] font-semibold uppercase tracking-[0.14em] text-black/35">
            Reviewer
          </dt>
          <dd className="mt-1 font-semibold text-black/75">{receipt.reviewerName}</dd>
          {receipt.reviewerEmail ? (
            <dd className="mt-0.5 break-all text-black/50">{receipt.reviewerEmail}</dd>
          ) : null}
        </div>
        <div>
          <dt className="text-[10px] font-semibold uppercase tracking-[0.14em] text-black/35">
            Date and time
          </dt>
          <dd className="mt-1 font-semibold text-black/75">
            <time dateTime={receipt.approvedAt}>{formatApprovedAt(receipt.approvedAt)}</time>
          </dd>
        </div>
        <div className="sm:col-span-2">
          <dt className="text-[10px] font-semibold uppercase tracking-[0.14em] text-black/35">
            Acceptance statement
          </dt>
          <dd className="mt-1 leading-5 text-black/65">{receipt.acceptanceStatement}</dd>
        </div>
        <div className="sm:col-span-2">
          <dt className="text-[10px] font-semibold uppercase tracking-[0.14em] text-black/35">
            Approved assets
          </dt>
          <dd className="mt-1 text-black/65">
            {receipt.assetCount === 0 ? (
              <span>No named assets on this revision.</span>
            ) : (
              <>
                <span className="font-semibold text-black/75">
                  {receipt.assetCount} file{receipt.assetCount === 1 ? "" : "s"}
                </span>
                <ul className="mt-1.5 space-y-0.5">
                  {receipt.assetNames.map((name) => (
                    <li key={name} className="flex items-start gap-1.5">
                      <Check className="mt-0.5 size-3 shrink-0 text-emerald-700" aria-hidden />
                      <span>{name}</span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </dd>
        </div>
      </dl>

      <div className="mt-4 rounded-xl border border-black/8 bg-white/70 px-3 py-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-black/35">
            Revision digest
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="text-[11px] font-semibold text-[#6354d4] underline-offset-2 hover:underline"
              aria-expanded={digestExpanded}
              aria-controls={digestId}
              onClick={() => setDigestExpanded((open) => !open)}
            >
              {digestExpanded ? "Hide full digest" : "Show full digest"}
            </button>
            <button
              type="button"
              className="inline-flex items-center gap-1 text-[11px] font-semibold text-black/55 hover:text-black/80"
              aria-label="Copy full revision digest"
              onClick={() => copyText("Digest", receipt.contentDigest)}
            >
              <Copy className="size-3" aria-hidden />
              Copy
            </button>
          </div>
        </div>
        <p
          id={digestId}
          className="mt-1 break-all font-mono text-[11px] leading-5 text-black/55"
        >
          {digestExpanded ? receipt.contentDigest : receipt.digestShort}
        </p>
      </div>

      {receipt.boundToFrozenRevision && isApproved ? (
        <p className="mt-3 text-[11px] leading-5 text-black/50">
          This approval applies only to frozen revision {receipt.revisionNumber} (digest above).
          It is a project closeout record—not a claim of universal electronic-signature validity.
          Later changes require a new revision.
        </p>
      ) : null}
    </article>
  );
}
