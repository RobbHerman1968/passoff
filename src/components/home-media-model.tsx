"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { ReviewPreview, type ReviewPreviewKind } from "@/components/review-preview";
import { cn } from "@/lib/utils";

const MODELS: {
  id: ReviewPreviewKind;
  label: string;
  href: string;
  points: { title: string; body: string }[];
}[] = [
  {
    id: "website",
    label: "Website",
    href: "/website-feedback-tool",
    points: [
      {
        title: "The real page",
        body: "Comments sit on the live website, including staged or signed-in views.",
      },
      {
        title: "The exact place",
        body: "A marker stays on the element, with page and browser context for the team.",
      },
      {
        title: "The recorded version",
        body: "Another-look requests and approval stay with the homepage review.",
      },
    ],
  },
  {
    id: "video",
    label: "Video",
    href: "/video-review-software",
    points: [
      {
        title: "The exact moment",
        body: "Notes keep their timestamp, so a title-card comment is not lost in the cut.",
      },
      {
        title: "The same conversation",
        body: "Replies stay attached to that moment as evidence on the issue.",
      },
      {
        title: "The same yes",
        body: "Approval is recorded on the cut the client reviewed, not an unnamed file.",
      },
    ],
  },
];

export function HomeMediaModel() {
  const [kind, setKind] = React.useState<ReviewPreviewKind>("website");
  const model = MODELS.find((item) => item.id === kind) ?? MODELS[0];

  function onTabKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") {
      return;
    }
    event.preventDefault();
    const next = kind === "website" ? "video" : "website";
    setKind(next);
    document.getElementById(`media-tab-${next}`)?.focus();
  }

  return (
    <div className="mt-8">
      <div
        role="tablist"
        aria-label="Website review and issue evidence"
        onKeyDown={onTabKeyDown}
        className="flex gap-1 border-b border-border"
      >
        {MODELS.map((item) => {
          const selected = item.id === kind;
          return (
            <button
              key={item.id}
              id={`media-tab-${item.id}`}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-controls="media-panel"
              tabIndex={selected ? 0 : -1}
              onClick={() => setKind(item.id)}
              className={cn(
                "min-h-11 px-4 text-sm font-medium",
                selected
                  ? "border-b-2 border-foreground text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {item.label}
            </button>
          );
        })}
      </div>
      <div
        id="media-panel"
        role="tabpanel"
        aria-labelledby={`media-tab-${model.id}`}
        className="grid gap-8 pt-8 lg:grid-cols-12 lg:gap-12"
      >
        <div className="lg:col-span-5">
          <ul>
            {model.points.map((point) => (
              <li key={point.title} className="border-t border-border py-4 first:border-t-0 first:pt-0">
                <p className="font-medium">{point.title}</p>
                <p className="mt-1 leading-7 text-muted-foreground">{point.body}</p>
              </li>
            ))}
          </ul>
          <Link
            href={model.href}
            className="mt-2 inline-flex min-h-11 items-center gap-2 text-sm font-medium text-foreground underline-offset-4 hover:underline"
          >
            Take a closer look <ArrowRight aria-hidden="true" className="size-4" />
          </Link>
        </div>
        <div className="min-w-0 lg:col-span-7">
          <ReviewPreview kind={model.id} stage="ready" compact className="lg:hidden" />
          <ReviewPreview kind={model.id} stage="ready" className="hidden lg:block" />
        </div>
      </div>
    </div>
  );
}
