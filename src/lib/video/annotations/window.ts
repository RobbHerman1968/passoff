/**
 * Which notes belong to "this moment" while a video plays or is paused. A note shows from a
 * moment before its time until a few seconds after, so it is not gone before it can be read.
 */

export const NOTE_VISIBLE_BEFORE_MS = 500;
export const NOTE_VISIBLE_AFTER_MS = 2_500;

export function isNoteVisibleAt(timestampMs: number, currentMs: number): boolean {
  return (
    currentMs >= timestampMs - NOTE_VISIBLE_BEFORE_MS &&
    currentMs <= timestampMs + NOTE_VISIBLE_AFTER_MS
  );
}

/** Ids of the notes that belong to the current moment, in the order given. */
export function visibleNoteIds(
  notes: ReadonlyArray<{ id: string; timestampMs: number }>,
  currentMs: number,
): string[] {
  const ids: string[] = [];
  for (const note of notes) {
    if (isNoteVisibleAt(note.timestampMs, currentMs)) ids.push(note.id);
  }
  return ids;
}

export function sameIds(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  for (let index = 0; index < a.length; index += 1) {
    if (a[index] !== b[index]) return false;
  }
  return true;
}

/** Position of a marker along the timeline, 0 to 100. Null until the length is known. */
export function timelinePercent(timestampMs: number, durationMs: number | null): number | null {
  if (durationMs == null || !Number.isFinite(durationMs) || durationMs <= 0) return null;
  const percent = (timestampMs / durationMs) * 100;
  return Math.min(100, Math.max(0, percent));
}
