"use client";

import * as React from "react";

import {
  ReviewPreview,
  type ReviewPreviewStage,
} from "@/components/review-preview";
import { cn } from "@/lib/utils";

const STEPS: {
  id: ReviewPreviewStage;
  title: string;
  body: string;
}[] = [
  {
    id: "share",
    title: "Share the work",
    body: "Open a review on the live website or latest video cut, then send one guest-friendly link.",
  },
  {
    id: "reply",
    title: "Resolve feedback in context",
    body: "The issue, reply, location, and recorded version stay together while the workspace updates the work.",
  },
  {
    id: "approved",
    title: "Approve the right version",
    body: "The final decision stays attached to the round the client reviewed, ready for a dependable handoff.",
  },
];

export function HomeWorkflow() {
  const [active, setActive] = React.useState<ReviewPreviewStage>("share");
  const activeStep = STEPS.find((step) => step.id === active) ?? STEPS[0];

  function onTabKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    const index = STEPS.findIndex((step) => step.id === active);
    if (event.key === "ArrowDown" || event.key === "ArrowRight") {
      event.preventDefault();
      const next = STEPS[(index + 1) % STEPS.length];
      setActive(next.id);
      document.getElementById(`workflow-tab-${next.id}`)?.focus();
    }
    if (event.key === "ArrowUp" || event.key === "ArrowLeft") {
      event.preventDefault();
      const next = STEPS[(index - 1 + STEPS.length) % STEPS.length];
      setActive(next.id);
      document.getElementById(`workflow-tab-${next.id}`)?.focus();
    }
    if (event.key === "Home") {
      event.preventDefault();
      setActive(STEPS[0].id);
      document.getElementById(`workflow-tab-${STEPS[0].id}`)?.focus();
    }
    if (event.key === "End") {
      event.preventDefault();
      const last = STEPS[STEPS.length - 1];
      setActive(last.id);
      document.getElementById(`workflow-tab-${last.id}`)?.focus();
    }
  }

  return (
    <div className="mt-12 grid items-center gap-8 lg:grid-cols-12 lg:gap-12">
      <div
        role="tablist"
        aria-label="Northline homepage review"
        aria-orientation="vertical"
        onKeyDown={onTabKeyDown}
        className="grid gap-2 lg:col-span-5"
      >
        {STEPS.map((step, index) => {
          const selected = step.id === active;
          return (
            <button
              key={step.id}
              id={`workflow-tab-${step.id}`}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-controls="workflow-panel"
              tabIndex={selected ? 0 : -1}
              onClick={() => setActive(step.id)}
              className={cn(
                "relative grid min-h-11 grid-cols-[2.25rem_minmax(0,1fr)] gap-4 overflow-hidden rounded-xl px-4 py-4 text-left transition-[background-color,box-shadow] duration-[var(--motion-duration)] ease-[var(--motion-ease)]",
                selected
                  ? "bg-card ring-1 ring-foreground/10 elevation-md"
                  : "hover:bg-card/60",
              )}
            >
              {selected ? (
                <span aria-hidden="true" className="absolute inset-y-3 left-0 w-1 rounded-r-full bg-primary" />
              ) : null}
              <span
                className={cn(
                  "flex size-9 items-center justify-center rounded-full font-mono text-sm font-medium",
                  selected
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground ring-1 ring-border",
                )}
              >
                {index + 1}
              </span>
              <span>
                <span className="block text-lg font-semibold tracking-[-0.01em]">{step.title}</span>
                <span className="mt-1 block text-sm leading-6 text-muted-foreground">
                  {step.body}
                </span>
              </span>
            </button>
          );
        })}
      </div>
      <div
        id="workflow-panel"
        role="tabpanel"
        aria-labelledby={`workflow-tab-${activeStep.id}`}
        className="min-w-0 lg:col-span-7"
      >
        <p className="sr-only">
          {activeStep.title}. {activeStep.body}
        </p>
        <ReviewPreview stage={activeStep.id} compact className="lg:hidden" />
        <ReviewPreview stage={activeStep.id} className="hidden lg:block" />
      </div>
    </div>
  );
}
