"use client";

import { Pause, Play, Upload, X } from "lucide-react";
import { useCallback, useEffect, useId, useRef, useState } from "react";

import { ConfirmDialog } from "@/components/confirm-dialog";
import { FormField } from "@/components/form-field";
import { useOnlineStatus } from "@/components/issues/use-online-status";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { VIDEO_EVIDENCE_COMMON_LIMITS } from "@/lib/billing/plans";
import { formatBytes } from "@/lib/attachments/types";
import { userMessageForFileTooLarge } from "@/lib/video/failure-reasons";
import {
  formatClipDuration,
  isAcceptedVideoMimeType,
  VIDEO_ACCEPTED_MIME_TYPES,
  VIDEO_MAX_CLIP_MINUTES,
  videoLimitsSentence,
} from "@/lib/video/states";

type UploadResponse = {
  ok: boolean;
  endpoint?: string;
  videoAssetId?: string;
  message?: string;
};

type Selected = { file: File; mimeType: string; durationSeconds: number };

type Phase =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "selected"; selected: Selected }
  | { kind: "starting"; selected: Selected }
  | { kind: "uploading"; selected: Selected; percent: number; paused: boolean; offline: boolean }
  | { kind: "finished" };

const EXTENSION_TYPES: Record<string, string> = {
  mp4: "video/mp4",
  m4v: "video/mp4",
  mov: "video/quicktime",
  webm: "video/webm",
};

/** Some browsers leave a file's type empty. Fall back to its extension. */
function resolveMimeType(file: File): string {
  if (file.type) return file.type.toLowerCase();
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  return EXTENSION_TYPES[extension] ?? "";
}

async function readVideoDuration(file: File): Promise<number> {
  const objectUrl = URL.createObjectURL(file);
  try {
    return await new Promise<number>((resolve, reject) => {
      const video = document.createElement("video");
      const timer = window.setTimeout(() => reject(new Error("timeout")), 15_000);
      video.preload = "metadata";
      video.onloadedmetadata = () => {
        window.clearTimeout(timer);
        resolve(video.duration);
      };
      video.onerror = () => {
        window.clearTimeout(timer);
        reject(new Error("invalid_video"));
      };
      video.src = objectUrl;
    });
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

const NETWORK_ERROR = "The upload didn’t finish. Check your connection, then try again.";

export function VideoEvidenceUploader({
  issueId,
  mode = "add",
  cancelUpload,
  onUploadFinished,
}: {
  issueId: string;
  /** "replace" keeps the current video until the new one is ready. */
  mode?: "add" | "replace";
  /** Removes the saved upload when it is cancelled or fails. Returns whether it worked. */
  cancelUpload?: (videoAssetId: string) => Promise<boolean>;
  /** Called once the whole file reached the video service. */
  onUploadFinished?: () => void;
}) {
  const baseId = useId();
  const online = useOnlineStatus();
  const inputRef = useRef<HTMLInputElement>(null);
  const uploadRef = useRef<{
    abort: () => void;
    pause: () => void;
    resume: () => void;
  } | null>(null);
  const videoAssetIdRef = useRef<string | null>(null);
  const milestoneRef = useRef(0);

  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [error, setError] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");

  const actionLabel = mode === "replace" ? "Replace video" : "Add video";
  const uploading = phase.kind === "uploading" || phase.kind === "starting";

  // Leaving mid-upload loses the upload. Ask first.
  useEffect(() => {
    if (!uploading) return;
    function onBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault();
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [uploading]);

  useEffect(() => {
    return () => uploadRef.current?.abort();
  }, []);

  const reset = useCallback(() => {
    uploadRef.current = null;
    videoAssetIdRef.current = null;
    milestoneRef.current = 0;
    if (inputRef.current) inputRef.current.value = "";
    setPhase({ kind: "idle" });
  }, []);

  async function onFileChosen(file: File | undefined) {
    setError(null);
    setAnnouncement("");
    if (!file) {
      setPhase({ kind: "idle" });
      return;
    }

    const mimeType = resolveMimeType(file);
    if (!isAcceptedVideoMimeType(mimeType)) {
      setError("Choose an MP4, MOV, or WebM video and try again.");
      setPhase({ kind: "idle" });
      return;
    }
    if (file.size > VIDEO_EVIDENCE_COMMON_LIMITS.maxClipBytes) {
      setError(userMessageForFileTooLarge());
      setPhase({ kind: "idle" });
      return;
    }

    setPhase({ kind: "checking" });
    let durationSeconds: number;
    try {
      durationSeconds = await readVideoDuration(file);
    } catch {
      setError("We couldn’t read this video. Choose another file and try again.");
      setPhase({ kind: "idle" });
      return;
    }
    if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
      setError("We couldn’t read this video’s length. Choose another file and try again.");
      setPhase({ kind: "idle" });
      return;
    }
    if (durationSeconds > VIDEO_EVIDENCE_COMMON_LIMITS.maxClipDurationSeconds) {
      setError(`Choose a video that is ${VIDEO_MAX_CLIP_MINUTES} minutes or shorter.`);
      setPhase({ kind: "idle" });
      return;
    }
    setPhase({ kind: "selected", selected: { file, mimeType, durationSeconds } });
  }

  async function discardSavedUpload() {
    const id = videoAssetIdRef.current;
    videoAssetIdRef.current = null;
    if (id && cancelUpload) await cancelUpload(id).catch(() => false);
  }

  async function startUpload(selected: Selected) {
    setError(null);
    setPhase({ kind: "starting", selected });
    setAnnouncement("Preparing your upload.");

    let result: UploadResponse | null = null;
    try {
      const response = await fetch("/api/video/uploads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          issueId,
          fileName: selected.file.name,
          mimeType: selected.mimeType,
          fileBytes: selected.file.size,
          durationSeconds: selected.durationSeconds,
        }),
      });
      result = (await response.json().catch(() => null)) as UploadResponse | null;
      if (!response.ok || !result?.ok || !result.endpoint || !result.videoAssetId) {
        setError(result?.message ?? "We couldn’t start this upload. Try again.");
        setPhase({ kind: "selected", selected });
        return;
      }
    } catch {
      setError("We couldn’t start this upload. Check your connection and try again.");
      setPhase({ kind: "selected", selected });
      return;
    }

    videoAssetIdRef.current = result.videoAssetId;
    milestoneRef.current = 0;
    setPhase({ kind: "uploading", selected, percent: 0, paused: false, offline: false });
    setAnnouncement("Uploading your video. Keep this tab open.");

    try {
      const { createUpload } = await import("@mux/upchunk");
      const upload = createUpload({
        endpoint: result.endpoint,
        file: selected.file,
        chunkSize: 5120,
        attempts: 5,
        delayBeforeAttempt: 2,
      });
      uploadRef.current = upload;

      upload.on("progress", (event) => {
        const percent = Math.min(100, Math.max(0, Math.floor(Number(event.detail) || 0)));
        setPhase((current) =>
          current.kind === "uploading" ? { ...current, percent } : current,
        );
        const milestone = Math.floor(percent / 25) * 25;
        if (milestone > milestoneRef.current && milestone < 100) {
          milestoneRef.current = milestone;
          setAnnouncement(`${milestone}% uploaded.`);
        }
      });
      upload.on("offline", () => {
        setPhase((current) =>
          current.kind === "uploading" ? { ...current, offline: true } : current,
        );
        setAnnouncement("You’re offline. The upload will continue when you reconnect.");
      });
      upload.on("online", () => {
        setPhase((current) =>
          current.kind === "uploading" ? { ...current, offline: false } : current,
        );
        setAnnouncement("You’re back online. Continuing the upload.");
      });
      upload.on("error", () => {
        uploadRef.current = null;
        void discardSavedUpload();
        setError(NETWORK_ERROR);
        setPhase({ kind: "selected", selected });
        setAnnouncement("The upload didn’t finish.");
      });
      upload.on("success", () => {
        uploadRef.current = null;
        videoAssetIdRef.current = null;
        setPhase({ kind: "finished" });
        setAnnouncement("Video uploaded. We’re getting it ready.");
        onUploadFinished?.();
      });
    } catch {
      await discardSavedUpload();
      setError("We couldn’t start this upload. Try again.");
      setPhase({ kind: "selected", selected });
    }
  }

  async function onCancel() {
    uploadRef.current?.abort();
    uploadRef.current = null;
    await discardSavedUpload();
    setAnnouncement("Upload cancelled. Your issue and written feedback are unchanged.");
    reset();
  }

  function onPauseToggle() {
    const upload = uploadRef.current;
    if (!upload || phase.kind !== "uploading") return;
    if (phase.paused) {
      upload.resume();
      setPhase({ ...phase, paused: false });
      setAnnouncement("Upload resumed.");
    } else {
      upload.pause();
      setPhase({ ...phase, paused: true });
      setAnnouncement("Upload paused.");
    }
  }

  const inputId = `${baseId}-file`;
  const accept = VIDEO_ACCEPTED_MIME_TYPES.join(",");

  return (
    <div className="grid gap-3">
      {phase.kind === "idle" || phase.kind === "checking" || phase.kind === "selected" ? (
        <FormField
          id={inputId}
          label="Video file"
          description={videoLimitsSentence()}
          error={error ?? undefined}
        >
          <Input
            ref={inputRef}
            type="file"
            accept={accept}
            disabled={phase.kind === "checking" || !online}
            onChange={(event) => void onFileChosen(event.target.files?.[0])}
          />
        </FormField>
      ) : null}

      {phase.kind === "checking" ? (
        <p role="status" className="text-sm text-muted-foreground">
          Checking your video…
        </p>
      ) : null}

      {phase.kind === "selected" || phase.kind === "starting" ? (
        <div className="grid gap-3 rounded-lg border border-border p-3">
          <p className="min-w-0 break-all text-sm font-medium">{phase.selected.file.name}</p>
          <p className="text-sm text-muted-foreground">
            {formatBytes(phase.selected.file.size)} · {formatClipDuration(phase.selected.durationSeconds)}
          </p>
          <div className="flex flex-wrap gap-2">
            {mode === "replace" ? (
              <ConfirmDialog
                title="Replace this video?"
                description="Your current video stays in place until the new one is ready. Then it is replaced and deleted for your team and any reviewers. The issue, its discussion, and its history stay."
                confirmLabel="Replace video"
                cancelLabel="Keep current video"
                destructive={false}
                onConfirm={() => void startUpload(phase.selected)}
                trigger={
                  <Button type="button" disabled={phase.kind === "starting" || !online}>
                    <Upload data-icon="inline-start" aria-hidden="true" />
                    {phase.kind === "starting" ? "Preparing upload…" : actionLabel}
                  </Button>
                }
              />
            ) : (
              <Button
                type="button"
                disabled={phase.kind === "starting" || !online}
                onClick={() => void startUpload(phase.selected)}
              >
                <Upload data-icon="inline-start" aria-hidden="true" />
                {phase.kind === "starting" ? "Preparing upload…" : actionLabel}
              </Button>
            )}
            {phase.kind === "selected" ? (
              <Button type="button" variant="outline" onClick={reset}>
                Choose a different video
              </Button>
            ) : null}
          </div>
          {mode === "replace" ? (
            <p className="text-sm text-muted-foreground">
              The current video stays in place until the new one is ready.
            </p>
          ) : null}
        </div>
      ) : null}

      {phase.kind === "uploading" ? (
        <div className="grid gap-3 rounded-lg border border-border p-3">
          <p className="min-w-0 break-all text-sm font-medium">{phase.selected.file.name}</p>
          <div className="grid gap-1.5">
            <div className="flex items-center justify-between gap-3 text-sm">
              <label htmlFor={`${baseId}-progress`}>Upload progress</label>
              <span className="tabular-nums">{phase.percent}%</span>
            </div>
            <progress
              id={`${baseId}-progress`}
              className="h-2 w-full overflow-hidden rounded-full [&::-moz-progress-bar]:bg-primary [&::-webkit-progress-bar]:bg-muted [&::-webkit-progress-value]:bg-primary"
              value={phase.percent}
              max={100}
            />
          </div>
          <p className="text-sm text-muted-foreground">
            {phase.offline
              ? "You’re offline. The upload will continue when you reconnect."
              : phase.paused
                ? "Upload paused. Choose Resume to continue."
                : "Keep this tab open until the upload finishes."}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={onPauseToggle}>
              {phase.paused ? (
                <>
                  <Play data-icon="inline-start" aria-hidden="true" />
                  Resume upload
                </>
              ) : (
                <>
                  <Pause data-icon="inline-start" aria-hidden="true" />
                  Pause upload
                </>
              )}
            </Button>
            <Button type="button" variant="outline" onClick={() => void onCancel()}>
              <X data-icon="inline-start" aria-hidden="true" />
              Cancel upload
            </Button>
          </div>
        </div>
      ) : null}

      {phase.kind === "finished" ? (
        <div className="grid gap-3 rounded-lg border border-border p-3">
          <p className="text-sm font-medium">Video uploaded</p>
          <p className="text-sm text-muted-foreground">
            We’re getting it ready. You can keep working; it will appear here when it’s ready.
          </p>
          <div>
            <Button type="button" variant="outline" onClick={reset}>
              Done
            </Button>
          </div>
        </div>
      ) : null}

      {!online && uploading === false && phase.kind !== "finished" ? (
        <p role="status" className="text-sm text-muted-foreground">
          You’re offline. Reconnect to add a video.
        </p>
      ) : null}

      <p className="sr-only" role="status" aria-live="polite">
        {announcement}
      </p>
    </div>
  );
}
