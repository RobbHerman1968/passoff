/** Client-safe deadline rules shared by the form and the server. */

/** A deadline must be at least this far ahead so reminders have time to matter. */
export const DEADLINE_MIN_LEAD_MS = 5 * 60 * 1000;
export const DEADLINE_MAX_LEAD_MS = 2 * 366 * 24 * 60 * 60 * 1000;

export const DEADLINE_INVALID_MESSAGE =
  "Enter a valid date and time, or clear the deadline.";
export const DEADLINE_PAST_MESSAGE =
  "Choose a date and time in the future, or clear the deadline.";
export const DEADLINE_TOO_FAR_MESSAGE =
  "Choose a date within the next two years.";

export type DeadlineParseResult =
  | { ok: true; deadline: Date | null }
  | { ok: false; message: string };

/**
 * Turn what a person entered into a deadline. Empty clears it. The value must be
 * an ISO timestamp (the form converts local time to ISO before sending).
 */
export function parseDeadlineInput(
  value: string | null | undefined,
  now: Date = new Date(),
): DeadlineParseResult {
  if (value == null || value.trim() === "") {
    return { ok: true, deadline: null };
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return { ok: false, message: DEADLINE_INVALID_MESSAGE };
  }
  const lead = parsed.getTime() - now.getTime();
  if (lead < DEADLINE_MIN_LEAD_MS) {
    return { ok: false, message: DEADLINE_PAST_MESSAGE };
  }
  if (lead > DEADLINE_MAX_LEAD_MS) {
    return { ok: false, message: DEADLINE_TOO_FAR_MESSAGE };
  }
  return { ok: true, deadline: parsed };
}

/** `datetime-local` inputs use local wall-clock time without a zone. */
export function toDateTimeLocalValue(date: Date | null | undefined): string {
  if (!date) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;
}

/** Convert a `datetime-local` value (local time) into an ISO timestamp, or "" to clear. */
export function dateTimeLocalToIso(value: string): string {
  if (!value.trim()) return "";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toISOString();
}

export function formatDeadline(date: Date): string {
  return date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}
