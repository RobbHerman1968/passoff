import { Check, Play } from "lucide-react";

import { StatusBadge } from "@/components/status-badge";
import { cn } from "@/lib/utils";
import type { IssueStatus } from "@/lib/issues/statuses";

export type ReviewPreviewKind = "website" | "video";

export type ReviewPreviewStage =
  | "share"
  | "comment"
  | "reply"
  | "ready"
  | "rereview"
  | "approved";

const STAGE_COPY: Record<
  ReviewPreviewStage,
  {
    round: string;
    status: IssueStatus;
    websiteLabel: string;
    videoLabel: string;
  }
> = {
  share: {
    round: "Version 1",
    status: "ready_for_verification",
    websiteLabel: "Passoff website review waiting for the first comment",
    videoLabel: "Passoff video review waiting for the first comment",
  },
  comment: {
    round: "Version 1",
    status: "open",
    websiteLabel: "Passoff website review with a new comment on the hero button",
    videoLabel: "Passoff video review with a new time-stamped comment",
  },
  reply: {
    round: "Version 1",
    status: "in_progress",
    websiteLabel: "Passoff website review with a designer reply on the same comment",
    videoLabel: "Passoff video review with a designer reply on the same moment",
  },
  ready: {
    round: "Version 2",
    status: "ready_for_verification",
    websiteLabel: "Passoff website review marked ready for another look",
    videoLabel: "Passoff video review marked ready for another look",
  },
  rereview: {
    round: "Version 2",
    status: "ready_for_verification",
    websiteLabel: "Passoff website review of the updated homepage",
    videoLabel: "Passoff video review of the updated cut",
  },
  approved: {
    round: "Version 2",
    status: "verified",
    websiteLabel: "Passoff website review with approval on this version",
    videoLabel: "Passoff issue evidence with approval on this version",
  },
};

const hasReply = (stage: ReviewPreviewStage) =>
  stage === "reply" || stage === "ready" || stage === "rereview" || stage === "approved";

const isUpdated = (stage: ReviewPreviewStage) =>
  stage === "ready" || stage === "rereview" || stage === "approved";

export function ReviewPreview({
  kind = "website",
  stage = "ready",
  compact = false,
  className,
}: {
  kind?: ReviewPreviewKind;
  stage?: ReviewPreviewStage;
  compact?: boolean;
  className?: string;
}) {
  const copy = STAGE_COPY[stage];
  const label = kind === "video" ? copy.videoLabel : copy.websiteLabel;

  return (
    <figure
      className={cn(
        "overflow-hidden rounded-2xl bg-card text-card-foreground ring-1 ring-foreground/10 elevation-lg",
        className,
      )}
    >
      <figcaption className="sr-only">{label}</figcaption>
      <div aria-hidden="true">
        <PreviewChrome kind={kind} round={copy.round} status={copy.status} />
        {kind === "video" ? (
          <VideoWorkspace stage={stage} compact={compact} />
        ) : (
          <WebsiteWorkspace stage={stage} compact={compact} />
        )}
      </div>
    </figure>
  );
}

function PreviewChrome({
  kind,
  round,
  status,
}: {
  kind: ReviewPreviewKind;
  round: string;
  status: IssueStatus;
}) {
  return (
    <div className="flex items-center gap-3 border-b border-border bg-muted/60 px-3 py-2.5 sm:px-4">
      <div className="hidden shrink-0 gap-1.5 sm:flex">
        <span className="size-2.5 rounded-full bg-foreground/15" />
        <span className="size-2.5 rounded-full bg-foreground/15" />
        <span className="size-2.5 rounded-full bg-foreground/15" />
      </div>
      <p className="mx-auto min-w-0 max-w-xs flex-1 truncate rounded-md bg-background px-3 py-1 text-xs text-muted-foreground sm:text-center">
        {kind === "video" ? "Northline · Spring film" : "northline.studio"}
      </p>
      <div className="flex shrink-0 items-center gap-2">
        <span className="hidden text-xs font-medium text-muted-foreground md:inline">{round}</span>
        <StatusBadge status={status} className="px-2 py-0.5 text-xs" />
      </div>
    </div>
  );
}

function Marker({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "flex size-7 items-center justify-center rounded-full rounded-bl-none bg-primary text-xs font-semibold text-primary-foreground ring-4 ring-primary/20",
        className,
      )}
    >
      1
    </span>
  );
}

function PinnedNote({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "w-56 rounded-xl bg-popover p-3 text-popover-foreground ring-1 ring-foreground/10 elevation-md",
        className,
      )}
    >
      <div className="flex items-center gap-2">
        <Avatar initials="JL" />
        <p className="text-xs font-semibold">Jordan · Northline</p>
      </div>
      <p className="mt-2 text-xs leading-5">
        Could this say “Browse”? A little warmer.
      </p>
    </div>
  );
}

function WebsiteWorkspace({
  stage,
  compact,
}: {
  stage: ReviewPreviewStage;
  compact: boolean;
}) {
  const showMarker = stage !== "share";
  const showNote = !compact && (stage === "comment" || stage === "reply");
  return (
    <div
      className={cn(
        "grid",
        compact ? "min-h-[16rem]" : "min-h-[22rem] lg:grid-cols-[minmax(0,1.4fr)_minmax(16rem,0.9fr)]",
      )}
    >
      <div className="relative min-w-0 bg-preview-canvas text-preview-canvas-foreground">
        <div className="flex items-center justify-between gap-3 px-5 py-4 text-sm sm:px-8">
          <p className="font-semibold tracking-tight">Northline</p>
          <p className="hidden text-sm text-preview-canvas-foreground/70 sm:block">
            Work · Studio · Contact
          </p>
        </div>
        <div className={cn("px-5 sm:px-8", compact ? "pb-6 pt-2" : "pb-10 pt-6 sm:pb-12")}>
          <p className="text-sm text-preview-canvas-foreground/70">Spring collection</p>
          <p
            className={cn(
              "mt-3 max-w-md font-semibold leading-[1.1] tracking-[-0.03em]",
              compact ? "text-2xl" : "text-3xl",
            )}
          >
            A quieter way to arrive at yes.
          </p>
          {!compact ? (
            <p className="mt-4 max-w-md text-sm leading-6 text-preview-canvas-foreground/75">
              Furniture and lighting for rooms that should feel finished, not staged.
            </p>
          ) : null}
          <div className="relative mt-6 inline-flex">
            <span
              className={cn(
                "inline-flex min-h-11 items-center rounded-full bg-foreground px-5 text-sm font-medium text-background",
                showMarker && !isUpdated(stage) && "outline-2 outline-offset-4 outline-dashed outline-primary",
              )}
            >
              {isUpdated(stage) ? "Browse the collection" : "Shop the collection"}
            </span>
            {showMarker ? <Marker className="absolute -right-4 -top-4" /> : null}
            {showNote ? <PinnedNote className="absolute left-[calc(100%+1.5rem)] top-1/2 hidden -translate-y-1/2 xl:block" /> : null}
          </div>
        </div>
      </div>
      <CommentThread kind="website" stage={stage} />
    </div>
  );
}

function VideoWorkspace({
  stage,
  compact,
}: {
  stage: ReviewPreviewStage;
  compact: boolean;
}) {
  const showMarker = stage !== "share";
  return (
    <div
      className={cn(
        "grid",
        compact ? "min-h-[16rem]" : "min-h-[22rem] lg:grid-cols-[minmax(0,1.4fr)_minmax(16rem,0.9fr)]",
      )}
    >
      <div className="flex min-w-0 flex-col bg-brand-dark text-brand-dark-foreground">
        <div
          className={cn(
            "relative flex flex-1 items-center justify-center",
            compact ? "min-h-40" : "min-h-52 sm:min-h-64",
          )}
        >
          <div className="absolute inset-6 rounded-lg bg-[radial-gradient(circle_at_30%_30%,var(--brand-glow),transparent_60%)] ring-1 ring-brand-dark-border" />
          <div className="relative grid justify-items-center gap-3">
            <span className="flex size-12 items-center justify-center rounded-full bg-brand-dark-surface ring-1 ring-brand-dark-border">
              <Play className="size-5 fill-current" />
            </span>
            <p className="text-sm font-medium">Title card · 00:41</p>
          </div>
          {showMarker ? <Marker className="absolute right-[24%] top-[30%]" /> : null}
        </div>
        <div className="border-t border-brand-dark-border px-4 py-3">
          <div className="flex items-center gap-3 text-xs tabular-nums">
            <span>00:41</span>
            <div className="relative h-1 flex-1 rounded-full bg-brand-dark-border">
              <div className="absolute inset-y-0 left-0 w-[38%] rounded-full bg-brand-dark-foreground" />
              <span className="absolute left-[38%] top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary ring-2 ring-brand-dark" />
            </div>
            <span>01:48</span>
          </div>
        </div>
      </div>
      <CommentThread kind="video" stage={stage} />
    </div>
  );
}

function Avatar({ initials, tone = "client" }: { initials: string; tone?: "client" | "team" }) {
  return (
    <span
      className={cn(
        "flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
        tone === "client" ? "bg-secondary text-secondary-foreground ring-1 ring-border" : "bg-foreground text-background",
      )}
    >
      {initials}
    </span>
  );
}

function CommentThread({
  kind,
  stage,
}: {
  kind: ReviewPreviewKind;
  stage: ReviewPreviewStage;
}) {
  const location = kind === "video" ? "00:41" : "Hero button";
  const clientNote =
    kind === "video"
      ? "Hold this title a beat longer so the name can land before the cut."
      : "Could this button say “Browse the collection”? It feels a little warmer.";
  const designerNote =
    kind === "video"
      ? "Extended the hold in this cut. Ready when you are."
      : "Updated the label in this round. Ready when you are.";

  return (
    <div className="flex min-w-0 flex-col border-t border-border bg-card lg:border-l lg:border-t-0">
      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
        <p className="text-sm font-semibold">Feedback</p>
        <p className="text-xs text-muted-foreground">
          {stage === "share" ? "No comments yet" : "1 comment"}
        </p>
      </div>
      <div className="flex flex-1 flex-col gap-4 p-4">
        {stage === "share" ? (
          <div className="grid flex-1 place-content-center gap-2 rounded-lg border border-dashed border-border p-4 text-center">
            <p className="text-sm font-medium">Waiting for the first note</p>
            <p className="text-sm leading-6 text-muted-foreground">
              Guests can point at the work as soon as they open the link.
            </p>
          </div>
        ) : null}

        {stage !== "share" ? (
          <article className="grid gap-2">
            <div className="flex items-center gap-2">
              <Avatar initials="JL" />
              <p className="text-sm font-semibold">Jordan</p>
              <span className="text-xs text-muted-foreground">Client</span>
              <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs font-medium">
                <span className="size-1.5 rounded-full bg-primary" />
                {location}
              </span>
            </div>
            <p className="pl-9 text-sm leading-6">{clientNote}</p>
          </article>
        ) : null}

        {hasReply(stage) ? (
          <article className="ml-9 grid gap-2 border-l-2 border-border pl-3">
            <div className="flex items-center gap-2">
              <Avatar initials="MR" tone="team" />
              <p className="text-sm font-semibold">Maya</p>
              <span className="text-xs text-muted-foreground">Designer</span>
            </div>
            <p className="text-sm leading-6">{designerNote}</p>
          </article>
        ) : null}

        {stage === "rereview" ? (
          <p className="text-sm leading-6 text-muted-foreground">
            The client is looking at round 2 on the same comment.
          </p>
        ) : null}

        {stage === "approved" ? (
          <p className="mt-auto flex items-center gap-2 rounded-lg bg-status-resolved px-3 py-2.5 text-sm font-medium text-status-resolved-foreground">
            <Check className="size-4" />
            Approved on {STAGE_COPY[stage].round}
          </p>
        ) : stage !== "share" ? (
          <p className="mt-auto rounded-lg border border-border px-3 py-2.5 text-sm text-muted-foreground">
            Reply in this thread…
          </p>
        ) : null}
      </div>
    </div>
  );
}
