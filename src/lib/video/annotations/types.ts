import type { CommentAuthorKind, CommentVisibility } from "@/lib/comments/types";

/**
 * Time-based notes on a video clip. Everything here is safe to send to the browser: no
 * provider ids, no playback access, no private data for guests.
 */

/** Where the clip a note was written for stands today. */
export type VideoNoteVideoState = "current" | "replaced" | "removed" | "expired";

export type VideoNoteView = {
  id: string;
  commentId: string;
  videoAssetId: string;
  videoState: VideoNoteVideoState;
  /** When the clip stopped being the current video. Null while it is current. */
  videoEndedAt: string | null;
  /** 1, 2, 3… in time order among the notes the viewer can see for the same clip. */
  number: number;
  timestampMs: number;
  /** Pin position inside the picture, 0 to 1. Both are null when there is no pin. */
  x: number | null;
  y: number | null;
  durationAtCreationMs: number | null;
  body: string;
  visibility: CommentVisibility;
  authorDisplayName: string;
  authorKind: CommentAuthorKind;
  createdAt: string;
};

/** What a guest may learn: whether the clip can still be watched, never why or when it left. */
export type GuestVideoNoteView = {
  id: string;
  commentId: string;
  videoAssetId: string;
  videoAvailable: boolean;
  number: number;
  timestampMs: number;
  x: number | null;
  y: number | null;
  body: string;
  authorDisplayName: string;
  authorKind: CommentAuthorKind;
  createdAt: string;
};

/** Link from a discussion comment to the note it belongs to. */
export type VideoNoteLink = {
  annotationId: string;
  timestampMs: number;
  hasPin: boolean;
  videoState: VideoNoteVideoState;
};

export const VIDEO_NOTE_SELECT_EVENT = "passoff:video-note-select";

export type VideoNoteSelectDetail = { annotationId: string };

/** Notes that arrive from a guest-safe source never carry private text. */
export const VIDEO_NOTE_GUEST_UNAVAILABLE_MESSAGE =
  "This note belongs to a video that is no longer available.";

const MS_PER_SECOND = 1_000;

/** 0:42, or 1:02:03 for very long clips. Rounds down, like a video player. */
export function formatVideoTimestamp(ms: number): string {
  const safe = Number.isFinite(ms) && ms > 0 ? Math.floor(ms / MS_PER_SECOND) : 0;
  const hours = Math.floor(safe / 3_600);
  const minutes = Math.floor((safe % 3_600) / 60);
  const seconds = safe % 60;
  const two = (value: number) => String(value).padStart(2, "0");
  return hours > 0 ? `${hours}:${two(minutes)}:${two(seconds)}` : `${minutes}:${two(seconds)}`;
}

/** The same time, spoken: "42 seconds", "1 minute 5 seconds". */
export function spokenVideoTimestamp(ms: number): string {
  const total = Number.isFinite(ms) && ms > 0 ? Math.floor(ms / MS_PER_SECOND) : 0;
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  const part = (value: number, unit: string) => `${value} ${unit}${value === 1 ? "" : "s"}`;
  if (minutes === 0) return part(seconds, "second");
  if (seconds === 0) return part(minutes, "minute");
  return `${part(minutes, "minute")} ${part(seconds, "second")}`;
}

/**
 * Reads what a person types for a time: "42", "0:42", "1:05", "1:05.5", or "1:02:03".
 * Returns null when it is not a time.
 */
export function parseVideoTimestamp(text: string): number | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const match = /^(?:(\d{1,2}):)?(?:(\d{1,3}):)?(\d{1,5})(?:\.(\d{1,3}))?$/.exec(trimmed);
  if (!match) return null;
  const [, first, second, last, fraction] = match;
  let hours = 0;
  let minutes = 0;
  if (first !== undefined && second !== undefined) {
    hours = Number(first);
    minutes = Number(second);
  } else if (first !== undefined) {
    minutes = Number(first);
  }
  const seconds = Number(last);
  if (first !== undefined && seconds > 59) return null;
  if (second !== undefined && minutes > 59) return null;
  const millis = fraction ? Number(fraction.padEnd(3, "0")) : 0;
  return ((hours * 60 + minutes) * 60 + seconds) * MS_PER_SECOND + millis;
}

export const VIDEO_NOTE_TIME_STEP_MS = 1_000;

/** Keeps a time inside the clip. Without a known length it only stops at zero. */
export function clampVideoTimestamp(ms: number, durationMs: number | null): number {
  const rounded = Math.round(Number.isFinite(ms) ? ms : 0);
  const floor = Math.max(0, rounded);
  return durationMs != null && durationMs > 0 ? Math.min(floor, durationMs) : floor;
}

/** Slack for clips whose measured length is a few frames shorter than the player reports. */
export const VIDEO_NOTE_END_TOLERANCE_MS = 500;

export type VideoNoteInputProblem =
  | "timestamp_invalid"
  | "timestamp_out_of_range"
  | "pin_invalid"
  | "pin_incomplete";

export type CheckedVideoNoteInput = {
  timestampMs: number;
  x: number | null;
  y: number | null;
};

export function roundNormalized(value: number): number {
  return Math.round(value * 1e7) / 1e7;
}

/**
 * Checks a time and an optional pin before anything is saved. The clip length comes from
 * the server's own record, never from the browser.
 */
export function checkVideoNoteInput(input: {
  timestampMs: unknown;
  x?: unknown;
  y?: unknown;
  durationMs: number | null;
}): { ok: true; value: CheckedVideoNoteInput } | { ok: false; problem: VideoNoteInputProblem } {
  const { timestampMs } = input;
  if (typeof timestampMs !== "number" || !Number.isFinite(timestampMs) || timestampMs < 0) {
    return { ok: false, problem: "timestamp_invalid" };
  }
  const rounded = Math.round(timestampMs);
  if (
    input.durationMs != null &&
    input.durationMs > 0 &&
    rounded > input.durationMs + VIDEO_NOTE_END_TOLERANCE_MS
  ) {
    return { ok: false, problem: "timestamp_out_of_range" };
  }
  const stored =
    input.durationMs != null && input.durationMs > 0
      ? Math.min(rounded, input.durationMs)
      : rounded;

  const hasX = input.x !== undefined && input.x !== null;
  const hasY = input.y !== undefined && input.y !== null;
  if (hasX !== hasY) return { ok: false, problem: "pin_incomplete" };
  if (!hasX || !hasY) return { ok: true, value: { timestampMs: stored, x: null, y: null } };

  const { x, y } = input;
  if (
    typeof x !== "number" ||
    typeof y !== "number" ||
    !Number.isFinite(x) ||
    !Number.isFinite(y) ||
    x < 0 ||
    x > 1 ||
    y < 0 ||
    y > 1
  ) {
    return { ok: false, problem: "pin_invalid" };
  }
  return { ok: true, value: { timestampMs: stored, x: roundNormalized(x), y: roundNormalized(y) } };
}

export function videoNoteProblemMessage(problem: VideoNoteInputProblem): string {
  switch (problem) {
    case "timestamp_invalid":
      return "Enter a time in the video, like 0:42.";
    case "timestamp_out_of_range":
      return "That time is after the end of the video. Choose a time inside the video.";
    case "pin_invalid":
    case "pin_incomplete":
      return "The pin isn’t on the picture. Place it on the video again, or remove it.";
  }
}

type Numberable = { id: string; videoAssetId: string; timestampMs: number; createdAt: string };

/** Time order, then creation order. The id keeps the order stable when both match. */
export function compareVideoNotes(a: Numberable, b: Numberable): number {
  if (a.timestampMs !== b.timestampMs) return a.timestampMs - b.timestampMs;
  if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * Numbers notes 1, 2, 3… per clip in time order. Number only the notes the viewer is allowed
 * to see, so a hidden private note never leaves a gap that gives it away.
 */
export function numberVideoNotes<T extends Numberable>(notes: T[]): Array<T & { number: number }> {
  const sorted = [...notes].sort((a, b) => {
    if (a.videoAssetId !== b.videoAssetId) return a.videoAssetId < b.videoAssetId ? -1 : 1;
    return compareVideoNotes(a, b);
  });
  const counters = new Map<string, number>();
  return sorted.map((note) => {
    const next = (counters.get(note.videoAssetId) ?? 0) + 1;
    counters.set(note.videoAssetId, next);
    return { ...note, number: next };
  });
}

export function videoNoteLabel(note: { number: number; timestampMs: number }): string {
  return `Note ${note.number} at ${formatVideoTimestamp(note.timestampMs)}`;
}

/** The name a pin or marker button announces. */
export function videoNoteAccessibleName(note: {
  number: number;
  timestampMs: number;
  body: string;
  visibility: CommentVisibility;
}): string {
  const text = note.body.replace(/\s+/g, " ").trim();
  const short = text.length > 60 ? `${text.slice(0, 57)}…` : text;
  const prefix = `${videoNoteLabel(note)}${note.visibility === "private" ? ", private note" : ""}`;
  return short ? `${prefix}: ${short}` : prefix;
}

export function videoNoteVideoStateLabel(state: VideoNoteVideoState): string | null {
  switch (state) {
    case "current":
      return null;
    case "replaced":
      return "Earlier video";
    case "removed":
      return "Removed video";
    case "expired":
      return "Expired video";
  }
}

/** Plain-language warning for a note whose clip can no longer be watched. */
export function videoNoteHistoricalWarning(state: VideoNoteVideoState): string | null {
  switch (state) {
    case "current":
      return null;
    case "replaced":
      return "This note was written for an earlier video that has been replaced. The time may not match the current video.";
    case "removed":
      return "This note was written for a video that has been removed. The time can’t be played.";
    case "expired":
      return "This note was written for a video that was removed after the retention period. The time can’t be played.";
  }
}
