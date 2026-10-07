import { VIDEO_EVIDENCE_COMMON_LIMITS } from "@/lib/billing/plans";
import { getVideoUsageLevel } from "@/lib/billing/video-evidence";

/**
 * Plain-language view of an issue's video evidence. Safe to send to the browser:
 * it never carries Mux identifiers, tokens, or raw provider messages.
 */

export const VIDEO_LIFECYCLES = ["current", "replacement", "retired", "removed"] as const;
export type VideoLifecycle = (typeof VIDEO_LIFECYCLES)[number];

export const VIDEO_REMOVAL_REASONS = [
  "deleted_by_member",
  "replaced",
  "superseded",
  "replacement_cancelled",
  "upload_abandoned",
  "needs_attention",
  "project_deleted",
  "retention_expired",
] as const;
export type VideoRemovalReason = (typeof VIDEO_REMOVAL_REASONS)[number];

/**
 * Only a clip that was ready leaves a "video removed" record behind. Cancelling an upload or
 * dismissing a failed attempt is not a removal of evidence.
 */
export function removalReasonFor(
  lifecycle: string,
  processingStatus: string,
): VideoRemovalReason {
  if (lifecycle === "replacement") return "replacement_cancelled";
  if (processingStatus === "ready") return "deleted_by_member";
  if (processingStatus === "failed" || processingStatus === "needs_attention") {
    return "needs_attention";
  }
  return "upload_abandoned";
}

export type VideoDisplayState =
  | "uploading"
  | "processing"
  | "ready"
  | "needs_attention"
  | "failed"
  | "removed";

/** Mux upload links last an hour. Past this, an unfinished upload is treated as abandoned. */
export const VIDEO_UPLOAD_STALE_MS = 70 * 60 * 1000;

export const VIDEO_MAX_CLIP_MINUTES = VIDEO_EVIDENCE_COMMON_LIMITS.maxClipDurationSeconds / 60;
export const VIDEO_MAX_CLIP_MEGABYTES = VIDEO_EVIDENCE_COMMON_LIMITS.maxClipBytes / (1024 * 1024);
export const VIDEO_MAX_HEIGHT_PIXELS = 1080;

export const VIDEO_ACCEPTED_MIME_TYPES = [
  "video/mp4",
  "video/quicktime",
  "video/webm",
] as const;

export function isAcceptedVideoMimeType(value: string): boolean {
  return (VIDEO_ACCEPTED_MIME_TYPES as readonly string[]).includes(value.toLowerCase());
}

export function videoLimitsSentence(): string {
  return `Choose one video up to ${VIDEO_MAX_CLIP_MINUTES} minutes and ${VIDEO_MAX_CLIP_MEGABYTES} MB (MP4, MOV, or WebM).`;
}

/** Statuses where the browser should keep checking for a result. */
export function isWorkingState(state: VideoDisplayState): boolean {
  return state === "uploading" || state === "processing";
}

export function isStaleUpload(
  input: { processingStatus: string; createdAt: Date },
  now: Date = new Date(),
): boolean {
  return (
    (input.processingStatus === "pending" || input.processingStatus === "uploading") &&
    now.getTime() - input.createdAt.getTime() > VIDEO_UPLOAD_STALE_MS
  );
}

/** Collapses stored status, lifecycle, and age into one state a person can understand. */
export function displayStateFor(
  input: { processingStatus: string; lifecycle: string; createdAt: Date },
  now: Date = new Date(),
): VideoDisplayState {
  if (input.lifecycle === "removed" || input.lifecycle === "retired") return "removed";
  if (isStaleUpload(input, now)) return "failed";
  switch (input.processingStatus) {
    case "ready":
      return "ready";
    case "needs_attention":
      return "needs_attention";
    case "failed":
      return "failed";
    case "processing":
      return "processing";
    default:
      return "uploading";
  }
}

export type VideoEvidenceView = {
  videoAssetId: string;
  role: "current" | "replacement";
  state: VideoDisplayState;
  durationSeconds: number | null;
  /** Plain-language explanation when something needs attention. */
  message: string | null;
  createdAt: string;
  uploadedByName: string | null;
};

export type VideoTombstoneView = {
  videoAssetId: string;
  removedAt: string;
  removedByName: string | null;
  reason: "removed" | "expired" | "replaced";
  /** True while the stored copy is still being deleted behind the scenes. */
  cleanupPending: boolean;
};

/** Days before a clip is removed when members start seeing a warning. */
export const VIDEO_RETENTION_WARNING_DAYS = 7;

const DAY_MS = 24 * 60 * 60 * 1000;

export type VideoRetentionState =
  /** The issue is open, so the clip is kept. */
  | "kept"
  /** The issue is closed and the removal date is more than a week away. */
  | "scheduled"
  /** Removal is within the warning window. */
  | "expiring_soon"
  /** Removal is within a day. */
  | "expiring_today";

export type VideoRetentionView = {
  state: VideoRetentionState;
  /** When the clip will be removed. Null while the issue is open. */
  endsAt: string | null;
  /** Whole days left, rounded up. Null while the issue is open. */
  daysLeft: number | null;
};

/**
 * What members are told about how long a clip is kept. `endsAt` is the deadline stored on
 * the clip; it is only set while the issue is closed.
 */
export function retentionViewFor(
  endsAt: Date | null,
  now: Date = new Date(),
): VideoRetentionView {
  if (!endsAt) return { state: "kept", endsAt: null, daysLeft: null };
  const remaining = endsAt.getTime() - now.getTime();
  const daysLeft = Math.max(0, Math.ceil(remaining / DAY_MS));
  let state: VideoRetentionState = "scheduled";
  if (remaining <= DAY_MS) state = "expiring_today";
  else if (remaining <= VIDEO_RETENTION_WARNING_DAYS * DAY_MS) state = "expiring_soon";
  return { state, endsAt: endsAt.toISOString(), daysLeft };
}

/** The line shown beside a kept clip. Plain words, no numbers hard-coded here. */
export function retentionText(retention: VideoRetentionView): string {
  const days = VIDEO_EVIDENCE_COMMON_LIMITS.retentionDaysAfterIssueCloses;
  switch (retention.state) {
    case "kept":
      return `Kept while this issue is open. After the issue is closed, the video is removed ${days} days later. Reopening the issue keeps it.`;
    case "scheduled":
      return `This issue is closed, so the video will be removed on ${formatRemovedDate(retention.endsAt ?? "")}. Reopen the issue to keep it.`;
    case "expiring_soon":
      return `This video will be removed on ${formatRemovedDate(retention.endsAt ?? "")} (${retention.daysLeft === 1 ? "1 day" : `${retention.daysLeft} days`} left). Reopen the issue to keep it.`;
    case "expiring_today":
      return `This video will be removed within a day. Reopen the issue now to keep it.`;
  }
}

export type VideoUsageLevel = ReturnType<typeof getVideoUsageLevel>;

export type VideoUsageView = {
  newMinutesUsed: number;
  newMinutesAllowed: number;
  retainedMinutesUsed: number;
  retainedMinutesAllowed: number;
  level: VideoUsageLevel;
  planName: string;
};

export type VideoUploadAction = {
  canUpload: boolean;
  /** "add" for the first clip, "replace" when a ready clip already exists. */
  mode: "add" | "replace";
  blockedReason: string | null;
};

export type IssueVideoView = {
  issueId: string;
  current: VideoEvidenceView | null;
  replacement: VideoEvidenceView | null;
  tombstone: VideoTombstoneView | null;
  action: VideoUploadAction;
  usage: VideoUsageView | null;
  /** Whether the viewer is a workspace member who may upload, replace, or delete. */
  canManage: boolean;
  /** True when the review or project is archived. Everything is read-only until restored. */
  archived: boolean;
  /** How long the clip people see is kept. Null when there is no ready clip. */
  retention: VideoRetentionView | null;
  needsPolling: boolean;
};

export function viewNeedsPolling(view: Pick<IssueVideoView, "current" | "replacement">): boolean {
  return [view.current, view.replacement].some((item) => item && isWorkingState(item.state));
}

/** First checks come quickly, then slow down. Returns milliseconds. */
export function nextPollDelayMs(attempt: number): number {
  if (attempt < 5) return 3_000;
  if (attempt < 15) return 6_000;
  return 12_000;
}

/** After this long the page stops checking and tells the person to come back later. */
export const VIDEO_POLL_GIVE_UP_MS = 20 * 60 * 1000;

export function videoStateLabel(state: VideoDisplayState): string {
  switch (state) {
    case "uploading":
      return "Uploading";
    case "processing":
      return "Getting ready";
    case "ready":
      return "Ready";
    case "needs_attention":
      return "Needs attention";
    case "failed":
      return "Couldn’t be prepared";
    case "removed":
      return "Removed";
  }
}

export function formatClipDuration(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(seconds) || seconds < 0) return "";
  const whole = Math.round(seconds);
  const minutes = Math.floor(whole / 60);
  const rest = whole % 60;
  return `${minutes}:${String(rest).padStart(2, "0")}`;
}

const LEVEL_ORDER: VideoUsageLevel[] = ["available", "approaching", "nearly_full", "full"];

export function worstUsageLevel(a: VideoUsageLevel, b: VideoUsageLevel): VideoUsageLevel {
  return LEVEL_ORDER[Math.max(LEVEL_ORDER.indexOf(a), LEVEL_ORDER.indexOf(b))];
}

/** Fixed to UTC so the server and the browser always print the same date. */
export function formatRemovedDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "an earlier date";
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

/** The line shown where a removed clip used to be, instead of a broken player. */
export function tombstoneText(tombstone: VideoTombstoneView): string {
  const date = formatRemovedDate(tombstone.removedAt);
  if (tombstone.reason === "expired") {
    return `Video removed on ${date} after the ${VIDEO_EVIDENCE_COMMON_LIMITS.retentionDaysAfterIssueCloses}-day retention period.`;
  }
  return tombstone.removedByName
    ? `Video removed on ${date} by ${tombstone.removedByName}.`
    : `Video removed on ${date}.`;
}
