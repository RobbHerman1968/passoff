import {
  VIDEO_MAX_CLIP_MEGABYTES,
  VIDEO_MAX_CLIP_MINUTES,
  VIDEO_MAX_HEIGHT_PIXELS,
} from "@/lib/video/states";

export const VIDEO_FAILURE_REASONS = {
  processing_failed: "processing_failed",
  duration_exceeded: "duration_exceeded",
  resolution_exceeded: "resolution_exceeded",
  allowance_exceeded: "allowance_exceeded",
  provider_deleted: "provider_deleted",
  upload_failed: "upload_failed",
} as const;

export type VideoFailureReason =
  (typeof VIDEO_FAILURE_REASONS)[keyof typeof VIDEO_FAILURE_REASONS];

/** Plain-language explanation for a stored failure code. Never exposes provider details. */
export function userMessageForVideoFailure(reason: string | null | undefined): string {
  switch (reason) {
    case VIDEO_FAILURE_REASONS.duration_exceeded:
      return `This video is longer than ${VIDEO_MAX_CLIP_MINUTES} minutes, so it can’t be used as evidence. Choose a shorter file and try again.`;
    case VIDEO_FAILURE_REASONS.resolution_exceeded:
      return `This video is larger than ${VIDEO_MAX_HEIGHT_PIXELS}p, so it can’t be used as evidence. Export it at ${VIDEO_MAX_HEIGHT_PIXELS}p or smaller and try again.`;
    case VIDEO_FAILURE_REASONS.allowance_exceeded:
      return "This video would use more video time than your plan includes. Remove other video evidence or ask your workspace owner to change plans.";
    case VIDEO_FAILURE_REASONS.provider_deleted:
      return "This video evidence is no longer available.";
    case VIDEO_FAILURE_REASONS.upload_failed:
      return "The video upload didn’t finish. Choose another file and try again.";
    case VIDEO_FAILURE_REASONS.processing_failed:
    default:
      return "We couldn’t prepare this video. Choose another file and try again.";
  }
}

export function userMessageForVideoProcessing(): string {
  return "We’re still preparing this video. It will appear here when it’s ready.";
}

export function userMessageForFileTooLarge(): string {
  return `Choose a video smaller than ${VIDEO_MAX_CLIP_MEGABYTES} MB.`;
}
