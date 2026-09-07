"use client";

import { useEffect, useId, useState } from "react";
import { CircleHelp, X } from "lucide-react";

const HELP_STEPS = [
  {
    number: "01",
    title: "Add",
    body: "Upload screenshots or a PDF, or paste a review URL. Arrange and rename assets before anyone sees them.",
  },
  {
    number: "02",
    title: "Publish",
    body: "Lock the current set as a numbered revision. Clients only see published work—not unfinished drafts.",
  },
  {
    number: "03",
    title: "Share",
    body: "Create a magic link and send it. No client login. Rotate the link anytime to invalidate the old one.",
  },
  {
    number: "04",
    title: "Review",
    body: "Your client opens the link, pins comments, then approves or requests changes. Resolve feedback here.",
  },
  {
    number: "05",
    title: "Handoff",
    body: "After approval, prepare delivery files, links, or notes, then release them on the same client link.",
  },
] as const;

const TIPS = [
  "Follow the purple button—it always matches the next step for this room.",
  "Published assets are locked. Start a new revision from More when you need edits.",
  "After approval, prepare handoff items privately, then release them to the client link.",
] as const;

export function RoomHelpSlide() {
  const [open, setOpen] = useState(true);
  const panelId = useId();
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <div className="relative">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((value) => !value)}
        className="inline-flex items-center gap-1.5 rounded-lg border border-[#a594f5]/35 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-[#6354d4] shadow-sm transition hover:bg-[#f3f0ff]"
      >
        <CircleHelp className="size-3.5 shrink-0" />
        Help
      </button>

      {open ? (
        <>
          <button
            type="button"
            aria-label="Close help"
            className="fixed inset-0 z-40 cursor-default bg-[#17221f]/20 backdrop-blur-[1px]"
            onClick={() => setOpen(false)}
          />
          <aside
            id={panelId}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            className="absolute top-[calc(100%+0.5rem)] right-0 z-50 flex max-h-[min(32rem,calc(100svh-4.5rem))] w-[min(20rem,calc(100vw-1.5rem))] flex-col overflow-hidden rounded-xl border border-[#a594f5]/30 bg-[#faf8ff] shadow-[0_12px_40px_rgba(40,30,70,0.14)]"
          >
            <div className="flex items-start justify-between gap-3 border-b border-[#a594f5]/20 px-4 py-3">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#7c6cf0]">
                  Room help
                </p>
                <h2 id={titleId} className="mt-1 text-sm font-semibold tracking-[-0.03em]">
                  How this room works
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-lg p-1.5 text-black/40 transition hover:bg-black/5 hover:text-black/70"
                aria-label="Close help panel"
              >
                <X className="size-4" />
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
              <p className="text-xs leading-5 text-black/55">
                An approval room walks a client from draft work to a signed-off revision, then handoff.
              </p>

              <ol className="mt-5 space-y-4">
                {HELP_STEPS.map((step) => (
                  <li key={step.number} className="flex gap-3">
                    <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md bg-[#ebe6fa] text-[10px] font-bold text-[#6354d4]">
                      {step.number}
                    </span>
                    <div>
                      <p className="text-xs font-semibold">{step.title}</p>
                      <p className="mt-1 text-[11px] leading-5 text-black/50">{step.body}</p>
                    </div>
                  </li>
                ))}
              </ol>

              <div className="mt-6 border-t border-black/8 pt-4">
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-black/35">
                  Quick tips
                </p>
                <ul className="mt-3 space-y-2.5">
                  {TIPS.map((tip) => (
                    <li key={tip} className="text-[11px] leading-5 text-black/55">
                      {tip}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </aside>
        </>
      ) : null}
    </div>
  );
}
