"use client";

import { Clock, Film, Trash2, TriangleAlert, Upload } from "lucide-react";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { toast } from "sonner";

import { refreshVideoNotesAction } from "@/app/(app)/projects/video-note-actions";
import {
  removeIssueVideoAction,
  type IssueVideoActionResult,
} from "@/app/(app)/projects/video-actions";
import { Alert } from "@/components/ui/alert";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { useOnlineStatus } from "@/components/issues/use-online-status";
import { Button } from "@/components/ui/button";
import { VideoEvidenceUploader } from "@/components/video/video-evidence-uploader";
import { VideoNoteList } from "@/components/video/video-note-list";
import { VideoNotesPanel } from "@/components/video/video-notes-panel";
import { formatRelativeActivity } from "@/lib/projects/format";
import type { VideoNoteView } from "@/lib/video/annotations/types";
import {
  formatClipDuration,
  nextPollDelayMs,
  retentionText,
  tombstoneText,
  VIDEO_MAX_CLIP_MEGABYTES,
  VIDEO_MAX_CLIP_MINUTES,
  VIDEO_POLL_GIVE_UP_MS,
  videoStateLabel,
  type IssueVideoView,
  type VideoEvidenceView,
  type VideoUsageView,
} from "@/lib/video/states";

const LOAD_FAILED_MESSAGE = "We couldn’t load this issue’s video. Reload the page to try again.";

function UsageLine({ usage }: { usage: VideoUsageView }) {
  const warn = usage.level !== "available";
  return (
    <div className="grid gap-1 text-sm">
      <p className="text-muted-foreground">
        <span className="tabular-nums">
          {usage.newMinutesUsed} of {usage.newMinutesAllowed} minutes
        </span>{" "}
        of new video used this month ·{" "}
        <span className="tabular-nums">
          {usage.retainedMinutesUsed} of {usage.retainedMinutesAllowed} minutes
        </span>{" "}
        kept ({usage.planName} plan)
      </p>
      {warn ? (
        <p role="status" className="font-medium">
          {usage.level === "full"
            ? "Your workspace has reached its video allowance. Existing issues and videos stay fully usable."
            : "Your workspace is close to its video allowance."}
        </p>
      ) : null}
    </div>
  );
}

function ProcessingNotice({
  video,
  onCancel,
  busy,
  canCancel,
}: {
  video: VideoEvidenceView;
  onCancel: () => void;
  busy: boolean;
  canCancel: boolean;
}) {
  const uploading = video.state === "uploading";
  return (
    <div className="grid gap-3 rounded-lg border border-border bg-muted/40 p-4">
      <p role="status" className="text-sm font-medium">
        {uploading
          ? "Your video is still uploading."
          : "Getting your clip ready. You can keep working; we’ll add it here."}
      </p>
      {uploading && canCancel ? (
        <p className="text-sm text-muted-foreground">
          If you closed the page during the upload, cancel it and add the video again.
        </p>
      ) : null}
      {canCancel ? (
        <div>
          <Button type="button" variant="outline" disabled={busy} onClick={onCancel}>
            Cancel upload
          </Button>
        </div>
      ) : null}
    </div>
  );
}

export function IssueVideoSection({
  projectId,
  reviewId,
  issueNumber,
  initialView,
  initialNotes = [],
}: {
  projectId: string;
  reviewId: string;
  issueNumber: number;
  initialView: IssueVideoView | null;
  /** Notes written at moments of this issue's videos, newest clip first. */
  initialNotes?: VideoNoteView[];
}) {
  const baseId = useId();
  const online = useOnlineStatus();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const uploaderRegionRef = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<IssueVideoView | null>(initialView);
  const [uploaderOpen, setUploaderOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [gaveUpFor, setGaveUpFor] = useState<string | null>(null);
  const viewRef = useRef<IssueVideoView | null>(initialView);
  const [notes, setNotes] = useState<VideoNoteView[]>(initialNotes);

  // Every change to what is on screen goes through here so ready and needs-attention
  // changes can be announced and shown exactly once.
  const updateView = useCallback((next: IssueVideoView) => {
    const before = viewRef.current;
    viewRef.current = next;
    setView(next);
    if (!before) return;
    const wasReady = before.current?.state === "ready";
    const isReady = next.current?.state === "ready";
    const replacementFinished =
      before.replacement != null &&
      next.replacement == null &&
      next.current != null &&
      next.current.videoAssetId !== before.current?.videoAssetId &&
      next.current.state === "ready";
    if ((!wasReady && isReady) || replacementFinished) {
      setStatus("Your video is ready to watch.");
      toast.success("Your video is ready to watch.");
      return;
    }
    const failedNow = (v: IssueVideoView) =>
      v.current?.state === "needs_attention" || v.replacement?.state === "needs_attention";
    if (!failedNow(before) && failedNow(next)) {
      setStatus("A video couldn’t be used and needs attention.");
    }
  }, []);

  const scope = { projectId, reviewId, issueNumber };
  const issueId = view?.issueId ?? null;

  const refresh = useCallback(async () => {
    if (!issueId) return;
    try {
      const response = await fetch(`/api/video/issues/${issueId}`, {
        headers: { Accept: "application/json" },
        cache: "no-store",
      });
      const body = (await response.json().catch(() => null)) as {
        ok?: boolean;
        view?: IssueVideoView;
      } | null;
      if (response.ok && body?.ok && body.view) updateView(body.view);
    } catch {
      // Keep what is on screen; the next check tries again.
    }
  }, [issueId, updateView]);

  const refreshNotes = useCallback(async () => {
    try {
      const result = await refreshVideoNotesAction({ projectId, reviewId, issueNumber });
      if (result.ok) setNotes(result.notes);
    } catch {
      // Keep the notes on screen; they refresh again with the next change.
    }
  }, [projectId, reviewId, issueNumber]);

  // When the clip people see changes (replaced, removed, expired), notes on the old clip move
  // to the "earlier video" group, so read them again.
  const noteKey = [view?.current?.videoAssetId, view?.current?.state, view?.tombstone?.videoAssetId].join("|");
  const lastNoteKeyRef = useRef(noteKey);
  useEffect(() => {
    if (lastNoteKeyRef.current === noteKey) return;
    lastNoteKeyRef.current = noteKey;
    void refreshNotes();
  }, [noteKey, refreshNotes]);

  const needsPolling = view?.needsPolling ?? false;
  const workKey = [view?.current?.videoAssetId, view?.replacement?.videoAssetId].join("|");
  const gaveUp = needsPolling && gaveUpFor === workKey;

  // Keep checking while a video uploads or is prepared, slowing down over time, until it
  // reaches a final state. Checks pause while the tab is hidden.
  useEffect(() => {
    if (!needsPolling) return;
    let cancelled = false;
    let timer: number | undefined;
    const startedAt = Date.now();
    let attempt = 0;

    function schedule() {
      if (cancelled) return;
      if (Date.now() - startedAt > VIDEO_POLL_GIVE_UP_MS) {
        setGaveUpFor(workKey);
        return;
      }
      timer = window.setTimeout(async () => {
        if (!document.hidden && navigator.onLine !== false) {
          attempt += 1;
          await refresh();
        }
        schedule();
      }, nextPollDelayMs(attempt));
    }

    function onVisible() {
      if (!document.hidden) void refresh();
    }
    document.addEventListener("visibilitychange", onVisible);
    schedule();
    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [needsPolling, refresh, workKey]);

  function applyResult(result: IssueVideoActionResult, success: string): boolean {
    if (!result.ok) {
      setError(result.message);
      return false;
    }
    updateView(result.view);
    setError(null);
    setStatus(success);
    toast.success(success);
    return true;
  }

  async function removeVideo(video: VideoEvidenceView, success: string) {
    setBusy(true);
    setError(null);
    try {
      const ok = applyResult(
        await removeIssueVideoAction({ ...scope, videoAssetId: video.videoAssetId }),
        success,
      );
      if (ok) headingRef.current?.focus();
    } catch {
      setError("We couldn’t remove this video. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  const cancelUpload = useCallback(
    async (videoAssetId: string) => {
      try {
        const result = await removeIssueVideoAction({ ...scope, videoAssetId });
        if (result.ok) updateView(result.view);
        return result.ok;
      } catch {
        return false;
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [projectId, reviewId, issueNumber],
  );

  function openUploader() {
    setUploaderOpen(true);
    window.setTimeout(() => uploaderRegionRef.current?.focus(), 0);
  }

  if (!view) {
    return (
      <section
        aria-labelledby={`${baseId}-heading`}
        className="rounded-xl border border-border bg-card p-4 text-card-foreground sm:p-5"
      >
        <h2 id={`${baseId}-heading`} className="type-section-title">
          Video evidence
        </h2>
        <p role="alert" className="mt-3 text-sm text-destructive">
          {LOAD_FAILED_MESSAGE}
        </p>
      </section>
    );
  }

  const { current, replacement, tombstone, action, usage, canManage, archived, retention } = view;
  // Archived work is read-only: nothing can be added, replaced, cancelled, or removed.
  const canChange = canManage && !archived;
  const showUploader = canManage && action.canUpload && (uploaderOpen || (!current && !replacement));
  const mode = action.mode;
  const addLabel = mode === "replace" ? "Replace video" : "Add video";

  return (
    <section
      aria-labelledby={`${baseId}-heading`}
      className="rounded-xl border border-border bg-card p-4 text-card-foreground sm:p-5"
    >
      <h2
        id={`${baseId}-heading`}
        ref={headingRef}
        tabIndex={-1}
        className="type-section-title outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        Video evidence
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        A short clip that shows what happened. Each issue can have one video, up to{" "}
        {VIDEO_MAX_CLIP_MINUTES} minutes and {VIDEO_MAX_CLIP_MEGABYTES} MB. Your team can watch it
        here.
      </p>

      {current?.state === "ready" ? (
        <div className="mt-4 grid gap-3">
          <VideoNotesPanel
            projectId={projectId}
            reviewId={reviewId}
            issueNumber={issueNumber}
            videoAssetId={current.videoAssetId}
            durationSeconds={current.durationSeconds}
            notes={notes}
            onNotesChange={setNotes}
            canAddNotes={canManage && !archived}
            readOnlyReason={
              archived
                ? "This review is archived, so notes can’t be added. Restore it to make changes."
                : null
            }
          />
          <p className="text-sm text-muted-foreground">
            {[
              current.durationSeconds != null
                ? `Length ${formatClipDuration(current.durationSeconds)}`
                : null,
              current.uploadedByName ? `Added by ${current.uploadedByName}` : null,
            ]
              .filter(Boolean)
              .join(" · ")}
            {" · "}
            <time dateTime={current.createdAt}>{formatRelativeActivity(current.createdAt)}</time>
          </p>
          {retention ? (
            retention.state === "expiring_soon" || retention.state === "expiring_today" ? (
              <Alert variant="warning" role="status" data-testid="retention-warning">
                <TriangleAlert aria-hidden="true" />
                <p data-slot="alert-description">{retentionText(retention)}</p>
              </Alert>
            ) : (
              <p
                className="flex items-start gap-2 text-sm text-muted-foreground"
                data-testid="retention-note"
              >
                <Clock aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
                <span>{retentionText(retention)}</span>
              </p>
            )
          ) : null}
        </div>
      ) : notes.length > 0 ? (
        <div className="mt-4">
          <VideoNoteList
            notes={notes}
            canReply
            emptyMessage={null}
          />
        </div>
      ) : null}

      {current && current.state !== "ready" && current.state !== "removed" ? (
        current.state === "uploading" || current.state === "processing" ? (
          <div className="mt-4">
            <ProcessingNotice
              video={current}
              busy={busy || !online}
              canCancel={canChange}
              onCancel={() => void removeVideo(current, "Upload cancelled.")}
            />
            {gaveUp ? (
              <p className="mt-3 text-sm text-muted-foreground">
                This is taking longer than usual. You can keep working and check back later.
              </p>
            ) : null}
          </div>
        ) : (
          <div className="mt-4 grid gap-3 rounded-lg border border-border bg-muted/40 p-4">
            <p className="text-sm font-medium">{videoStateLabel(current.state)}</p>
            <p className="text-sm">{current.message}</p>
            <p className="text-sm text-muted-foreground">
              The written issue isn’t affected. Add a different video to try again.
            </p>
          </div>
        )
      ) : null}

      {replacement ? (
        <div className="mt-4 grid gap-3 rounded-lg border border-border bg-muted/40 p-4">
          {replacement.state === "uploading" || replacement.state === "processing" ? (
            <>
              <p role="status" className="text-sm font-medium">
                {replacement.state === "uploading"
                  ? "Your new video is uploading."
                  : "Getting your new clip ready."}
              </p>
              <p className="text-sm text-muted-foreground">
                The current video stays in place until the new one is ready.
              </p>
              {canChange ? (
                <div>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={busy || !online}
                    onClick={() => void removeVideo(replacement, "Upload cancelled.")}
                  >
                    Cancel upload
                  </Button>
                </div>
              ) : null}
            </>
          ) : (
            <>
              <p className="text-sm font-medium">The new video couldn’t be used</p>
              <p className="text-sm">{replacement.message}</p>
              <p className="text-sm text-muted-foreground">
                The current video is still in place.
              </p>
              {canChange ? (
                <div>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={busy || !online}
                    onClick={() => void removeVideo(replacement, "Dismissed.")}
                  >
                    Dismiss
                  </Button>
                </div>
              ) : null}
            </>
          )}
        </div>
      ) : null}

      {!current && !replacement ? (
        tombstone ? (
          <div className="mt-4 rounded-lg border border-dashed border-input/60 p-4">
            <p className="flex items-center gap-2 text-sm font-medium">
              <Film aria-hidden="true" className="size-4 shrink-0" />
              Video removed
            </p>
            <p className="mt-1 text-sm text-muted-foreground">{tombstoneText(tombstone)}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              The issue, its discussion, and its history are unchanged.
            </p>
          </div>
        ) : (
          <p className="mt-4 text-sm text-muted-foreground">
            No video has been added to this issue yet.
          </p>
        )
      ) : null}

      {usage && canManage ? (
        <div className="mt-4">
          <UsageLine usage={usage} />
        </div>
      ) : null}

      {canManage && !action.canUpload && action.blockedReason ? (
        <p className="mt-4 text-sm text-muted-foreground">{action.blockedReason}</p>
      ) : null}

      {canManage && action.canUpload ? (
        <div className="mt-4 grid gap-3 border-t border-border pt-4">
          {!showUploader ? (
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" onClick={openUploader}>
                <Upload data-icon="inline-start" aria-hidden="true" />
                {addLabel}
              </Button>
            </div>
          ) : (
            <div
              ref={uploaderRegionRef}
              tabIndex={-1}
              className="grid gap-3 outline-none"
              aria-label={mode === "replace" ? "Replace video" : "Add video"}
            >
              <h3 className="text-sm font-medium">{addLabel}</h3>
              <VideoEvidenceUploader
                issueId={view.issueId}
                mode={mode}
                cancelUpload={cancelUpload}
                onUploadFinished={() => {
                  setUploaderOpen(false);
                  void refresh();
                }}
              />
              {uploaderOpen && (current || replacement) ? (
                <div>
                  <Button type="button" variant="ghost" onClick={() => setUploaderOpen(false)}>
                    Close
                  </Button>
                </div>
              ) : null}
            </div>
          )}
        </div>
      ) : null}

      {canChange && current?.state === "ready" ? (
        <div className="mt-3">
          <ConfirmDialog
            title="Remove this video?"
            description="The video will be deleted for your team and any reviewers. The issue, its discussion, and its history stay. This can’t be undone."
            confirmLabel="Remove video"
            cancelLabel="Keep video"
            onConfirm={() => void removeVideo(current, "Video removed.")}
            trigger={
              <Button type="button" variant="outline" disabled={busy || !online}>
                <Trash2 data-icon="inline-start" aria-hidden="true" />
                Remove video
              </Button>
            }
          />
        </div>
      ) : null}

      {canChange && current && (current.state === "failed" || current.state === "needs_attention") ? (
        <div className="mt-3">
          <Button
            type="button"
            variant="ghost"
            disabled={busy || !online}
            onClick={() => void removeVideo(current, "Dismissed.")}
          >
            Dismiss
          </Button>
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="mt-3 text-sm text-destructive">
          {error}
        </p>
      ) : null}
      {!online ? (
        <p role="status" className="mt-3 text-sm text-muted-foreground">
          You’re offline. Reconnect to change video evidence.
        </p>
      ) : null}

      <p className="sr-only" role="status" aria-live="polite">
        {status}
      </p>
    </section>
  );
}
