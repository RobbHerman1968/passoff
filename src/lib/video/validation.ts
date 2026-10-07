import { VIDEO_EVIDENCE_COMMON_LIMITS, type VideoEvidenceLimits } from "@/lib/billing/plans";
import { VIDEO_FAILURE_REASONS, type VideoFailureReason } from "@/lib/video/failure-reasons";
import { VIDEO_MAX_HEIGHT_PIXELS } from "@/lib/video/states";

/** Mux reports length in whole milliseconds of float seconds; allow small rounding drift. */
export const VIDEO_DURATION_TOLERANCE_MS = 2_000;

export type ReadyAssetCheck =
  | { ok: true }
  | { ok: false; reason: VideoFailureReason };

/**
 * Mux's measurements are the source of truth. The browser's numbers only decide whether
 * an upload may start; they never decide whether a clip is allowed to play.
 */
export function checkMeasuredClip(input: {
  durationSeconds: number;
  maxHeight: number | null;
}): ReadyAssetCheck {
  if (
    !Number.isFinite(input.durationSeconds) ||
    input.durationSeconds > VIDEO_EVIDENCE_COMMON_LIMITS.maxClipDurationSeconds
  ) {
    return { ok: false, reason: VIDEO_FAILURE_REASONS.duration_exceeded };
  }
  if (input.maxHeight != null && input.maxHeight > VIDEO_MAX_HEIGHT_PIXELS) {
    return { ok: false, reason: VIDEO_FAILURE_REASONS.resolution_exceeded };
  }
  return { ok: true };
}

/**
 * The allowance was checked with the browser's reported length. When Mux measures a
 * clearly longer clip, the allowance has to be checked again with the real length.
 */
export function measuredLengthNeedsAllowanceCheck(
  declaredDurationMs: number | null,
  measuredDurationMs: number,
): boolean {
  if (declaredDurationMs == null) return true;
  return measuredDurationMs > declaredDurationMs + VIDEO_DURATION_TOLERANCE_MS;
}

export function measuredClipFitsAllowance(input: {
  limits: VideoEvidenceLimits | null;
  measuredDurationSeconds: number;
  /** Usage from every other clip, so this clip is not counted twice. */
  otherNewSecondsThisMonth: number;
  otherRetainedSeconds: number;
}): ReadyAssetCheck {
  const { limits } = input;
  if (!limits) return { ok: false, reason: VIDEO_FAILURE_REASONS.allowance_exceeded };
  if (
    input.otherNewSecondsThisMonth + input.measuredDurationSeconds >
      limits.newUploadMinutesPerCalendarMonth * 60 ||
    input.otherRetainedSeconds + input.measuredDurationSeconds > limits.retainedMinutes * 60
  ) {
    return { ok: false, reason: VIDEO_FAILURE_REASONS.allowance_exceeded };
  }
  return { ok: true };
}

/** Largest pixel height among Mux's video tracks, or null when Mux did not say. */
export function maxHeightFromTracks(tracks: unknown): number | null {
  if (!Array.isArray(tracks)) return null;
  let tallest: number | null = null;
  for (const track of tracks) {
    if (!track || typeof track !== "object") continue;
    const record = track as Record<string, unknown>;
    if (record.type !== "video") continue;
    const height = record.max_height;
    if (typeof height === "number" && Number.isFinite(height)) {
      tallest = tallest == null ? height : Math.max(tallest, height);
    }
  }
  return tallest;
}
