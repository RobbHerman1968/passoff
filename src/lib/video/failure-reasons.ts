export const VIDEO_FAILURE_REASONS = {
  processing_failed: "processing_failed",
  duration_exceeded: "duration_exceeded",
  provider_deleted: "provider_deleted",
  upload_failed: "upload_failed",
} as const;

export type VideoFailureReason =
  (typeof VIDEO_FAILURE_REASONS)[keyof typeof VIDEO_FAILURE_REASONS];

export function userMessageForVideoFailure(reason: string | null | undefined): string {
  switch (reason) {
    case VIDEO_FAILURE_REASONS.duration_exceeded:
      return "This video is longer than 3 minutes, so it can’t be used as evidence. Choose a shorter file and try again.";
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
