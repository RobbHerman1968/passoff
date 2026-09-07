import { Check, ExternalLink, Package, ShieldCheck } from "lucide-react";

/**
 * Homepage product-proof panels that mirror real Pass-Off UI states
 * (feedback → approval receipt → released handoff) without fake metrics.
 */
function ProofFrame({
  title,
  badge,
  children,
}: {
  title: string;
  badge: string;
  children: React.ReactNode;
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-[color-mix(in_srgb,var(--brand-ink)_14%,transparent)] bg-[var(--brand-surface)] shadow-[0_20px_60px_rgba(46,38,84,0.22)]">
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
        <div className="min-w-0">
          <p className="truncate text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--brand-glow)]">
            Approval room
          </p>
          <p className="mt-0.5 truncate text-sm font-semibold text-[var(--brand-soft)]">{title}</p>
        </div>
        <span className="shrink-0 rounded-lg bg-[color-mix(in_srgb,var(--brand)_28%,transparent)] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-white">
          {badge}
        </span>
      </div>
      {children}
    </div>
  );
}

function FeedbackProof() {
  return (
    <ProofFrame title="Harbor & Co. Website" badge="Revision 1">
      <div className="grid gap-0 sm:grid-cols-[1.1fr_0.9fr]">
        <div
          className="relative aspect-[4/3] bg-[linear-gradient(160deg,#2a2340_0%,#1a1625_55%,#12101a_100%)] p-4 sm:aspect-auto sm:min-h-[220px]"
          role="img"
          aria-label="Design canvas with a pinned client comment on the hero layout"
        >
          <div className="absolute inset-4 rounded-xl border border-white/10 bg-[color-mix(in_srgb,var(--brand-deep)_55%,#0f0d14)] p-3">
            <div className="h-2 w-28 rounded-full bg-white/20" />
            <div className="mt-4 space-y-2">
              <div className="h-2 w-full rounded-full bg-white/12" />
              <div className="h-2 w-[78%] rounded-full bg-white/10" />
            </div>
            <div className="mt-5 grid grid-cols-3 gap-2">
              <div className="aspect-square rounded-lg bg-[var(--brand)]/35" />
              <div className="aspect-square rounded-lg bg-white/8" />
              <div className="aspect-square rounded-lg bg-white/8" />
            </div>
            <div className="absolute left-[36%] top-[40%] size-3 rounded-full border-2 border-white bg-[var(--brand)] shadow-[0_0_0_4px_rgba(124,108,240,0.35)]" />
          </div>
        </div>
        <div className="border-t border-white/10 p-4 sm:border-l sm:border-t-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/35">
            Visual feedback
          </p>
          <div className="mt-3 space-y-2">
            <div className="rounded-xl bg-white/5 px-3 py-2.5">
              <p className="text-[11px] font-semibold text-white/80">Alex · Client</p>
              <p className="mt-1 text-xs leading-5 text-white/45">
                Soften the hero headline and make the reserve CTA clearer.
              </p>
              <p className="mt-1 text-[10px] uppercase tracking-[0.12em] text-[var(--brand-glow)]">
                Open
              </p>
            </div>
            <div className="rounded-xl bg-white/5 px-3 py-2.5">
              <p className="text-[11px] font-semibold text-white/80">Alex · Client</p>
              <p className="mt-1 text-xs leading-5 text-white/45">
                Leave more table edge in the hero photo crop.
              </p>
              <p className="mt-1 text-[10px] uppercase tracking-[0.12em] text-white/30">
                Resolved
              </p>
            </div>
          </div>
        </div>
      </div>
    </ProofFrame>
  );
}

function ReceiptProof() {
  return (
    <ProofFrame title="Harbor & Co. Website" badge="Revision 2">
      <div className="p-4">
        <div
          className="rounded-xl border border-emerald-400/30 bg-emerald-500/10 p-3.5"
          role="img"
          aria-label="Approval receipt showing approved status for revision 2 with reference ID and shortened digest"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-white">
              <ShieldCheck className="size-3.5" aria-hidden />
              Approved
            </span>
            <span className="font-mono text-[11px] text-white/45">PO-A1B2C3D4</span>
          </div>
          <p className="mt-3 text-sm font-semibold text-[var(--brand-soft)]">Harbor & Co. Website</p>
          <p className="mt-0.5 text-xs text-white/45">Harbor & Co. · Revision 2</p>
          <p className="mt-3 text-[11px] leading-5 text-white/55">
            Alex Rivera · Recorded on this frozen revision only.
          </p>
          <div className="mt-3 flex items-start gap-1.5 text-xs text-white/50">
            <Check className="mt-0.5 size-3 shrink-0 text-emerald-400" aria-hidden />
            3 approved assets · digest 7f3a9c2e1b04…
          </div>
        </div>
      </div>
    </ProofFrame>
  );
}

function HandoffProof() {
  return (
    <ProofFrame title="Harbor & Co. Website" badge="Handoff">
      <div className="p-4">
        <div
          className="rounded-xl border border-white/10 bg-white/5 p-3.5"
          role="img"
          aria-label="Released handoff list with PDF, ZIP, and staging site link on the same review link"
        >
          <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/35">
            <Package className="size-3.5" aria-hidden />
            Final deliverables
          </div>
          <ul className="mt-3 space-y-2">
            <li className="rounded-lg bg-black/20 px-3 py-2">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-semibold text-white/80">Launch specification</p>
                <span className="text-[9px] uppercase tracking-[0.1em] text-white/35">PDF</span>
              </div>
              <p className="mt-1 text-[11px] text-[var(--brand-glow)]">Download File</p>
            </li>
            <li className="rounded-lg bg-black/20 px-3 py-2">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-semibold text-white/80">Final Webflow exports</p>
                <span className="text-[9px] uppercase tracking-[0.1em] text-white/35">ZIP</span>
              </div>
              <p className="mt-1 text-[11px] text-[var(--brand-glow)]">Download File</p>
            </li>
            <li className="rounded-lg bg-black/20 px-3 py-2">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-semibold text-white/80">Staging site URL</p>
                <span className="text-[9px] uppercase tracking-[0.1em] text-white/35">Link</span>
              </div>
              <p className="mt-1 inline-flex items-center gap-1 text-[11px] text-[var(--brand-glow)]">
                Open Link <ExternalLink className="size-3" aria-hidden />
              </p>
            </li>
          </ul>
        </div>
      </div>
    </ProofFrame>
  );
}

const proofs = [
  {
    id: "feedback",
    eyebrow: "01 · Feedback",
    title: "Visual comments on a frozen revision",
    body: "Clients pin notes on the exact files in review—no account required.",
    Panel: FeedbackProof,
  },
  {
    id: "receipt",
    eyebrow: "02 · Approval",
    title: "A receipt tied to that revision",
    body: "Sign-off records reviewer, time, statement, and the revision digest.",
    Panel: ReceiptProof,
  },
  {
    id: "handoff",
    eyebrow: "03 · Handoff",
    title: "Final files from the same link",
    body: "After release, deliverables sit beside the approval—not in a new portal.",
    Panel: HandoffProof,
  },
] as const;

export function ProductProofSection() {
  return (
    <section
      id="product-proof"
      aria-labelledby="proof-heading"
      className="border-t border-[color-mix(in_srgb,var(--brand-ink)_10%,transparent)] bg-[#faf8ff]"
    >
      <div className="mx-auto max-w-6xl px-5 py-14 sm:px-8 lg:py-16">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--brand)]">
          The closeout loop
        </p>
        <h2
          id="proof-heading"
          className="mt-4 max-w-2xl font-[family-name:var(--font-display)] text-3xl font-semibold tracking-[-0.045em] sm:text-4xl"
        >
          Frozen revision → approval → handoff.
        </h2>
        <p className="mt-4 max-w-xl text-sm leading-7 text-[color-mix(in_srgb,var(--brand-deep)_65%,transparent)]">
          Pass-Off is built for the final yes and professional delivery—not another general
          project board.
        </p>

        <ol className="mt-12 grid gap-10 lg:grid-cols-3 lg:gap-6">
          {proofs.map(({ id, eyebrow, title, body, Panel }) => (
            <li key={id} className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--brand)]">
                {eyebrow}
              </p>
              <h3 className="mt-2 font-[family-name:var(--font-display)] text-lg font-semibold tracking-[-0.03em]">
                {title}
              </h3>
              <p className="mt-2 text-sm leading-6 text-[color-mix(in_srgb,var(--brand-deep)_62%,transparent)]">
                {body}
              </p>
              <div className="passoff-rise mt-5">
                <Panel />
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
