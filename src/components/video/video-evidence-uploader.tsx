"use client";

import { useId, useState } from "react";
import MuxUploader from "@mux/mux-uploader-react";

import { VIDEO_EVIDENCE_COMMON_LIMITS } from "@/lib/billing/plans";

type UploadResponse = {
  ok: boolean;
  endpoint?: string;
  message?: string;
};

async function readVideoDuration(file: File) {
  const objectUrl = URL.createObjectURL(file);
  try {
    return await new Promise<number>((resolve, reject) => {
      const video = document.createElement("video");
      video.preload = "metadata";
      video.onloadedmetadata = () => resolve(video.duration);
      video.onerror = () => reject(new Error("invalid_video"));
      video.src = objectUrl;
    });
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export function VideoEvidenceUploader({ issueId }: { issueId: string }) {
  const descriptionId = useId();
  const [message, setMessage] = useState<string | null>(null);

  async function createEndpoint(file?: File) {
    if (!file) throw new Error("Choose a video and try again.");
    setMessage("Preparing your upload…");

    let durationSeconds: number;
    try {
      durationSeconds = await readVideoDuration(file);
    } catch {
      const error = "We couldn’t read this video. Choose another file and try again.";
      setMessage(error);
      throw new Error(error);
    }

    const response = await fetch("/api/video/uploads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        issueId,
        fileName: file.name,
        mimeType: file.type,
        fileBytes: file.size,
        durationSeconds,
      }),
    });
    const result = (await response.json().catch(() => null)) as UploadResponse | null;
    if (!response.ok || !result?.ok || !result.endpoint) {
      const error = result?.message ?? "We couldn’t start this upload. Try again.";
      setMessage(error);
      throw new Error(error);
    }

    setMessage("Uploading video…");
    return result.endpoint;
  }

  return (
    <section aria-labelledby={`${descriptionId}-heading`} className="space-y-3">
      <div>
        <h2 id={`${descriptionId}-heading`} className="font-medium">
          Add video evidence
        </h2>
        <p id={descriptionId} className="text-sm text-muted-foreground">
          Choose one video up to 3 minutes and 250 MB. It will stay attached to this issue.
        </p>
      </div>
      <MuxUploader
        endpoint={createEndpoint}
        maxFileSize={VIDEO_EVIDENCE_COMMON_LIMITS.maxClipBytes}
        pausable
        dynamicChunkSize
        aria-describedby={descriptionId}
        onUploadStart={() => setMessage("Uploading video…")}
        onSuccess={() => setMessage("Video uploaded. We’re preparing it for review.")}
        onUploadError={() =>
          setMessage("The upload didn’t finish. Check your connection and try again.")
        }
      />
      <p aria-live="polite" className="min-h-5 text-sm text-muted-foreground">
        {message}
      </p>
    </section>
  );
}
