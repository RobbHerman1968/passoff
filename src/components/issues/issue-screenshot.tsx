"use client";

import { Expand, RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { AnnotatedIssueScreenshot } from "@/components/issues/annotated-issue-screenshot";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { IssueDetail } from "@/lib/issues/list";
import type { ScreenshotAnnotation } from "@/lib/issues/screenshot-annotation";

type ScreenshotStatus = IssueDetail["screenshotCaptureStatus"];

function screenshotAlt(
  issueNumber: number,
  hasAnnotation: boolean,
): string {
  if (hasAnnotation) {
    return `Captured page context for issue ${issueNumber}. The selected area is marked.`;
  }
  return `Captured page context for issue ${issueNumber}.`;
}

export function IssueScreenshot({
  projectId,
  reviewId,
  issueNumber,
  status,
  captureMethod,
  annotation = null,
}: {
  projectId: string;
  reviewId: string;
  issueNumber: number;
  status: ScreenshotStatus;
  captureMethod: IssueDetail["screenshotCaptureMethod"];
  annotation?: ScreenshotAnnotation | null;
}) {
  const router = useRouter();
  const [imageFailed, setImageFailed] = useState(false);
  const [fullSizeOpen, setFullSizeOpen] = useState(false);
  const [imageKey, setImageKey] = useState(0);

  const screenshotUrl = `/api/projects/${projectId}/reviews/${reviewId}/issues/${issueNumber}/screenshot`;
  const isReady = status === "ready";
  const showImage = isReady && !imageFailed;
  const hasAnnotation = Boolean(annotation);
  const alt = screenshotAlt(issueNumber, hasAnnotation);
  const showReconstructionNote =
    showImage && captureMethod === "browser_reconstruction";

  function refreshPicture() {
    setImageFailed(false);
    setImageKey((value) => value + 1);
    router.refresh();
  }

  return (
    <section
      aria-labelledby="issue-screenshot-heading"
      className="rounded-xl border border-border bg-card p-4 text-card-foreground sm:p-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="issue-screenshot-heading" className="type-section-title">
          Screenshot
        </h2>
        {showImage ? (
          <Button
            type="button"
            variant="outline"
            onClick={() => setFullSizeOpen(true)}
          >
            <Expand data-icon="inline-start" aria-hidden="true" />
            View full size
          </Button>
        ) : null}
      </div>

      <div className="mt-4">
        {showImage ? (
          <figure className="grid gap-3">
            <div className="overflow-hidden rounded-lg border border-border bg-muted/30">
              <AnnotatedIssueScreenshot
                src={`${screenshotUrl}?v=${imageKey}`}
                alt={alt}
                issueNumber={issueNumber}
                annotation={annotation}
                imgKey={imageKey}
                imageClassName="max-h-[min(70vh,40rem)]"
                onError={() => setImageFailed(true)}
              />
            </div>
            <figcaption className="grid gap-1 text-sm text-muted-foreground">
              {hasAnnotation ? (
                <span>
                  The orange outline and numbered pin show what the reviewer
                  selected.
                </span>
              ) : (
                <span>
                  The exact selected area was not recorded for this issue.
                </span>
              )}
              {showReconstructionNote ? (
                <span>
                  Captured in the reviewer’s browser. Small visual differences
                  from the live page are possible.
                </span>
              ) : null}
            </figcaption>
          </figure>
        ) : null}

        {isReady && imageFailed ? (
          <ScreenshotMessage
            title="We couldn’t show this picture"
            description="The feedback is still saved. Try loading the picture again."
            actionLabel="Try again"
            onAction={refreshPicture}
          />
        ) : null}

        {status === "pending" ? (
          <ScreenshotMessage
            title="Picture still preparing"
            description="The feedback was saved. The picture is still being prepared."
            actionLabel="Refresh"
            onAction={refreshPicture}
          />
        ) : null}

        {status === "failed" ? (
          <ScreenshotMessage
            title="Picture couldn’t be prepared"
            description="The feedback was saved, but the picture could not be prepared. You can still use the written feedback and page details."
            actionLabel="Refresh"
            onAction={refreshPicture}
          />
        ) : null}

        {status === "unavailable" || status === null ? (
          <ScreenshotMessage
            title="No picture available"
            description="The feedback was saved, but no picture is available for this issue."
          />
        ) : null}
      </div>

      <Dialog open={fullSizeOpen} onOpenChange={setFullSizeOpen}>
        <DialogContent
          className="flex h-[min(100dvh,100vh)] max-h-[min(100dvh,100vh)] w-[min(100vw,100%)] max-w-[min(100vw,100%)] flex-col gap-3 overflow-hidden rounded-none border-0 p-3 sm:max-w-[min(100vw,100%)] sm:rounded-none"
          showCloseButton
        >
          <DialogHeader className="shrink-0 pr-10">
            <DialogTitle>Full-size screenshot</DialogTitle>
            <DialogDescription>
              Issue #{issueNumber}. Press Escape or Close when you’re done.
            </DialogDescription>
          </DialogHeader>
          <div className="min-h-0 flex-1 overflow-auto overscroll-contain">
            <AnnotatedIssueScreenshot
              src={`${screenshotUrl}?v=${imageKey}`}
              alt={alt}
              issueNumber={issueNumber}
              annotation={annotation}
              imgKey={`full-${imageKey}`}
              imageClassName="max-h-none max-w-none"
            />
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}

function ScreenshotMessage({
  title,
  description,
  actionLabel,
  onAction,
}: {
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div className="rounded-lg border border-dashed border-input/70 bg-muted/20 p-4">
      <p className="text-sm font-medium text-foreground">{title}</p>
      <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      {actionLabel && onAction ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mt-3 min-h-11"
          onClick={onAction}
        >
          <RefreshCw data-icon="inline-start" aria-hidden="true" />
          {actionLabel}
        </Button>
      ) : null}
    </div>
  );
}
