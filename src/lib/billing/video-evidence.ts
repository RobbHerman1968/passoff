import type { VideoEvidenceLimits, VideoEvidencePolicy } from "@/lib/billing/plans";

export type VideoUploadBlockReason =
  | "invalid_video"
  | "clip_too_long"
  | "file_too_large"
  | "monthly_upload_limit"
  | "retained_video_limit"
  | "undecided_plan";

export type VideoUploadCheck =
  | { allowed: true }
  | {
      allowed: false;
      reason: VideoUploadBlockReason;
      message: string;
    };

export function resolveVideoEvidenceLimits(
  policy: VideoEvidencePolicy,
): VideoEvidenceLimits | null {
  return policy.status === "approved" ? policy.limits : null;
}

export function checkVideoEvidenceUpload(
  policy: VideoEvidencePolicy,
  input: {
    durationSeconds: number;
    fileBytes: number;
    uploadedSecondsThisMonth: number;
    retainedSeconds: number;
  },
): VideoUploadCheck {
  const limits = resolveVideoEvidenceLimits(policy);
  if (!limits) {
    return {
      allowed: false,
      reason: "undecided_plan",
      message: "Video-evidence limits for this plan are not decided yet.",
    };
  }
  if (!Number.isFinite(input.durationSeconds) || input.durationSeconds <= 0) {
    return {
      allowed: false,
      reason: "invalid_video",
      message: "We couldn’t read this video’s length. Choose another file and try again.",
    };
  }

  if (input.durationSeconds > limits.maxClipDurationSeconds) {
    return {
      allowed: false,
      reason: "clip_too_long",
      message: "Choose a video that is 3 minutes or shorter.",
    };
  }

  if (!Number.isFinite(input.fileBytes) || input.fileBytes <= 0) {
    return {
      allowed: false,
      reason: "invalid_video",
      message: "We couldn’t read this video file. Choose another file and try again.",
    };
  }

  if (input.fileBytes > limits.maxClipBytes) {
    return {
      allowed: false,
      reason: "file_too_large",
      message: "Choose a video smaller than 250 MB.",
    };
  }

  const nextMonthlySeconds = input.uploadedSecondsThisMonth + input.durationSeconds;
  if (nextMonthlySeconds > limits.newUploadMinutesPerCalendarMonth * 60) {
    return {
      allowed: false,
      reason: "monthly_upload_limit",
      message:
        "This upload would use more new video than your plan includes this month. Try again next month or change plans.",
    };
  }

  const nextRetainedSeconds = input.retainedSeconds + input.durationSeconds;
  if (nextRetainedSeconds > limits.retainedMinutes * 60) {
    return {
      allowed: false,
      reason: "retained_video_limit",
      message:
        "This upload would use more retained video than your plan includes. Remove expired evidence or change plans.",
    };
  }

  return { allowed: true };
}

export function getVideoEvidenceRetentionEnd(issueClosedAt: Date, retentionDays: number) {
  return new Date(issueClosedAt.getTime() + retentionDays * 24 * 60 * 60 * 1000);
}

export function getVideoUsageLevel(used: number, limit: number) {
  if (limit <= 0 || used >= limit) return "full" as const;

  const percentage = used / limit;
  if (percentage >= 0.9) return "nearly_full" as const;
  if (percentage >= 0.75) return "approaching" as const;
  return "available" as const;
}
