import { Check } from "lucide-react";

import type { ProductPreviewVariant } from "@/lib/seo/types";

function Frame({
  children,
  title,
  badge,
}: {
  children: React.ReactNode;
  title: string;
  badge: string;
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-[color-mix(in_srgb,var(--brand-ink)_14%,transparent)] bg-[var(--brand-surface)] shadow-[0_28px_80px_rgba(46,38,84,0.28)]">
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

export function ProductPreview({
  variant,
  alt,
}: {
  variant: ProductPreviewVariant;
  alt: string;
}) {
  if (variant === "client-link") {
    return (
      <figure className="w-full min-w-0">
        <Frame title="Client review link" badge="Shared">
          <div className="grid gap-0 sm:grid-cols-[1.1fr_0.9fr]">
            <div className="relative aspect-[4/3] bg-[linear-gradient(160deg,#2a2340_0%,#1a1625_55%,#12101a_100%)] p-4 sm:aspect-auto sm:min-h-[260px]">
              <div className="absolute inset-4 rounded-xl border border-white/10 bg-[color-mix(in_srgb,var(--brand-deep)_55%,#0f0d14)] p-3">
                <div className="h-2 w-28 rounded-full bg-white/20" />
                <div className="mt-5 grid grid-cols-2 gap-2">
                  <div className="aspect-[4/3] rounded-lg bg-white/10" />
                  <div className="aspect-[4/3] rounded-lg bg-[var(--brand)]/30" />
                </div>
              </div>
            </div>
            <div className="border-t border-white/10 p-4 sm:border-l sm:border-t-0">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/35">
                Your decision
              </p>
              <div className="mt-3 space-y-2">
                <div className="flex h-9 items-center justify-center rounded-lg bg-[var(--brand)] text-xs font-semibold text-white">
                  Approve Revision
                </div>
                <div className="flex h-9 items-center justify-center rounded-lg border border-white/15 text-xs font-semibold text-white/70">
                  Request Changes
                </div>
              </div>
              <p className="mt-4 text-xs leading-5 text-white/45">
                No account required for clients.
              </p>
            </div>
          </div>
        </Frame>
        <figcaption className="sr-only">{alt}</figcaption>
      </figure>
    );
  }

  if (variant === "figma-export") {
    return (
      <figure className="w-full min-w-0">
        <Frame title="Onboarding screens" badge="From Figma export">
          <div className="p-4">
            <div className="flex flex-wrap items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-white/40">
              <span className="rounded-md border border-white/15 px-2 py-1">Figma frames</span>
              <span aria-hidden="true">→</span>
              <span className="rounded-md bg-[var(--brand)]/30 px-2 py-1 text-[var(--brand-soft)]">
                Pass-Off revision
              </span>
            </div>
            <div className="mt-4 grid grid-cols-3 gap-2">
              <div className="aspect-[3/4] rounded-lg border border-dashed border-white/20 bg-white/5 p-2">
                <div className="h-1.5 w-10 rounded-full bg-white/25" />
                <div className="mt-3 space-y-1.5">
                  <div className="h-1.5 w-full rounded-full bg-white/10" />
                  <div className="h-1.5 w-2/3 rounded-full bg-white/10" />
                </div>
              </div>
              <div className="aspect-[3/4] rounded-lg bg-[var(--brand)]/25 p-2">
                <div className="h-1.5 w-10 rounded-full bg-white/30" />
                <div className="mt-3 h-12 rounded-md bg-white/10" />
              </div>
              <div className="aspect-[3/4] rounded-lg border border-white/10 bg-white/5 p-2">
                <div className="h-1.5 w-8 rounded-full bg-white/25" />
                <div className="mt-3 h-8 rounded-md bg-white/10" />
              </div>
            </div>
            <p className="mt-4 text-xs leading-5 text-white/45">
              Export the frames you present. Approve the published set—not a live file that keeps
              changing.
            </p>
          </div>
        </Frame>
        <figcaption className="sr-only">{alt}</figcaption>
      </figure>
    );
  }

  if (variant === "website-screens") {
    return (
      <figure className="w-full min-w-0">
        <Frame title="Marketing site redesign" badge="Revision 4">
          <div className="grid grid-cols-2 gap-3 p-4">
            <div className="rounded-xl border border-white/10 bg-white/5 p-2">
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-white/35">
                Desktop
              </p>
              <div className="mt-2 aspect-[16/10] rounded-lg bg-[linear-gradient(160deg,#352b55,#1a1625)] p-2">
                <div className="h-2 w-16 rounded-full bg-white/20" />
                <div className="mt-3 h-8 rounded-md bg-[var(--brand)]/35" />
              </div>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/5 p-2">
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-white/35">
                Mobile
              </p>
              <div className="mx-auto mt-2 aspect-[9/14] w-2/3 rounded-lg bg-[linear-gradient(160deg,#352b55,#1a1625)] p-2">
                <div className="h-1.5 w-10 rounded-full bg-white/20" />
                <div className="mt-2 h-6 rounded-md bg-[var(--brand)]/35" />
              </div>
            </div>
          </div>
        </Frame>
        <figcaption className="sr-only">{alt}</figcaption>
      </figure>
    );
  }

  if (variant === "agency-handoff") {
    return (
      <figure className="w-full min-w-0">
        <Frame title="Launch campaign boards" badge="Approved">
          <div className="p-4">
            <div className="flex items-center gap-2 rounded-xl border border-[color-mix(in_srgb,var(--brand)_40%,transparent)] bg-[color-mix(in_srgb,var(--brand)_14%,transparent)] px-3 py-2.5">
              <Check className="size-3.5 text-[var(--brand-soft)]" />
              <p className="text-xs font-semibold text-[var(--brand-soft)]">
                Approved · Revision 6 digest on record
              </p>
            </div>
            <div className="mt-4 space-y-2">
              <div className="flex items-center justify-between rounded-lg bg-white/5 px-3 py-2 text-xs text-white/70">
                <span>Final social exports</span>
                <span className="text-[var(--brand-glow)]">Ready</span>
              </div>
              <div className="flex items-center justify-between rounded-lg bg-white/5 px-3 py-2 text-xs text-white/70">
                <span>Landing page assets</span>
                <span className="text-[var(--brand-glow)]">Ready</span>
              </div>
              <div className="flex items-center justify-between rounded-lg bg-white/5 px-3 py-2 text-xs text-white/70">
                <span>Trafficking notes</span>
                <span className="text-[var(--brand-glow)]">Ready</span>
              </div>
            </div>
          </div>
        </Frame>
        <figcaption className="sr-only">{alt}</figcaption>
      </figure>
    );
  }

  return (
    <figure className="w-full min-w-0">
      <Frame title="Acme marketing site" badge="Revision 3">
        <div className="grid gap-0 sm:grid-cols-[1.15fr_0.85fr]">
          <div className="relative aspect-[4/3] bg-[linear-gradient(160deg,#2a2340_0%,#1a1625_55%,#12101a_100%)] p-4 sm:aspect-auto sm:min-h-[260px]">
            <div className="absolute inset-4 rounded-xl border border-white/10 bg-[color-mix(in_srgb,var(--brand-deep)_55%,#0f0d14)] p-3">
              <div className="h-2 w-24 rounded-full bg-white/20" />
              <div className="mt-4 space-y-2">
                <div className="h-2 w-full rounded-full bg-white/12" />
                <div className="h-2 w-[82%] rounded-full bg-white/10" />
                <div className="h-2 w-[64%] rounded-full bg-white/8" />
              </div>
              <div className="mt-6 grid grid-cols-3 gap-2">
                <div className="aspect-square rounded-lg bg-[var(--brand)]/35" />
                <div className="aspect-square rounded-lg bg-white/8" />
                <div className="aspect-square rounded-lg bg-white/8" />
              </div>
              <div className="absolute left-[38%] top-[42%] size-3 rounded-full border-2 border-white bg-[var(--brand)] shadow-[0_0_0_4px_rgba(124,108,240,0.35)]" />
            </div>
          </div>
          <div className="border-t border-white/10 p-4 sm:border-l sm:border-t-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/35">
              Client feedback
            </p>
            <div className="mt-3 space-y-3">
              <div className="rounded-xl bg-white/5 px-3 py-2.5">
                <p className="text-[11px] font-semibold text-white/80">Jordan · Client</p>
                <p className="mt-1 text-xs leading-5 text-white/45">
                  Can we tighten the hero spacing on mobile?
                </p>
              </div>
              <div className="rounded-xl border border-[color-mix(in_srgb,var(--brand)_40%,transparent)] bg-[color-mix(in_srgb,var(--brand)_14%,transparent)] px-3 py-2.5">
                <div className="flex items-center gap-1.5 text-[11px] font-semibold text-[var(--brand-soft)]">
                  <Check className="size-3.5" />
                  Approved · Revision 3
                </div>
                <p className="mt-1 text-xs leading-5 text-white/45">
                  Sign-off recorded on this immutable revision.
                </p>
              </div>
            </div>
          </div>
        </div>
      </Frame>
      <figcaption className="sr-only">{alt}</figcaption>
    </figure>
  );
}
