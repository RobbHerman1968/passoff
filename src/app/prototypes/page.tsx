import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight, Boxes, FlaskConical, Workflow } from "lucide-react";

import { BrandMark } from "@/components/brand-mark";

export const metadata: Metadata = {
  title: "Prototypes (not in production nav)",
  description: "Internal Pass-Off prototypes. Not linked from production navigation.",
  robots: { index: false, follow: false },
};

export default function PrototypesPage() {
  return (
    <main className="min-h-screen bg-[#f4f3ef] px-6 py-10 text-[#17221f] lg:px-12">
      <div className="mx-auto max-w-6xl">
        <div className="mb-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5 text-lg font-semibold tracking-[-0.03em]">
            <BrandMark size={28} />
            Pass-Off
          </Link>
          <div className="flex items-center gap-2 rounded-full border border-black/10 bg-white px-3 py-1.5 text-xs font-medium text-black/60 shadow-sm">
            <FlaskConical className="size-3.5" /> Prototype lab
          </div>
        </div>

        <div className="mb-8 rounded-2xl border border-amber-500/30 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-950">
          <strong>Prototype only.</strong> These experiments are not part of the production product
          navigation and are not indexed for search. Prefer{" "}
          <Link href="/dashboard" className="font-semibold underline">
            Approval Rooms
          </Link>{" "}
          for the live workflow.
        </div>

        <section className="max-w-3xl">
          <p className="mb-4 text-xs font-semibold uppercase tracking-[0.2em] text-[#7c6cf0]">
            Product experiments
          </p>
          <h1 className="text-5xl font-semibold tracking-[-0.055em] sm:text-6xl">
            Explore prototypes before we ship.
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-8 text-black/55">
            Interactive concepts for testing ideas. Not linked from the main Pass-Off marketing or
            dashboard navigation.
          </p>
        </section>
        <section className="mt-16 grid gap-5 md:grid-cols-2">
          <Link
            href="/prototypes/figma-process"
            className="group relative overflow-hidden rounded-[28px] border border-black/10 bg-[#16131f] p-7 text-white shadow-[0_24px_60px_rgba(23,34,31,0.12)] transition-transform duration-300 hover:-translate-y-1"
          >
            <div className="mb-20 flex items-start justify-between">
              <div className="flex size-12 items-center justify-center rounded-2xl bg-[#e4dffc] text-[#12362e]">
                <Workflow className="size-5" />
              </div>
              <ArrowUpRight className="size-5 text-white/50 transition-transform group-hover:translate-x-1 group-hover:-translate-y-1" />
            </div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#8edac8]">
              Prototype 01
            </p>
            <h2 className="mt-3 text-3xl font-semibold tracking-[-0.04em]">Figma process handoff</h2>
            <p className="mt-3 max-w-md leading-7 text-white/60">
              Import screens and prototype links, expose missing behavior, and generate a developer
              contract.
            </p>
            <div className="mt-8 flex flex-wrap gap-2 text-xs text-white/70">
              <span className="rounded-full bg-white/8 px-3 py-1.5">Interactive</span>
              <span className="rounded-full bg-white/8 px-3 py-1.5">Mock data</span>
              <span className="rounded-full bg-white/8 px-3 py-1.5">Desktop</span>
            </div>
          </Link>
          <div className="rounded-[28px] border border-dashed border-black/15 bg-white/45 p-7">
            <div className="mb-20 flex size-12 items-center justify-center rounded-2xl bg-black/5 text-black/35">
              <Boxes className="size-5" />
            </div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-black/35">
              Next experiment
            </p>
            <h2 className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-black/35">
              Live-site review
            </h2>
            <p className="mt-3 max-w-md leading-7 text-black/30">
              Explore an installed review layer for staging and production websites.
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}
