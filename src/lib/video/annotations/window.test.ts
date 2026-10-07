import { describe, expect, it } from "vitest";

import {
  isNoteVisibleAt,
  NOTE_VISIBLE_AFTER_MS,
  NOTE_VISIBLE_BEFORE_MS,
  sameIds,
  timelinePercent,
  visibleNoteIds,
} from "@/lib/video/annotations/window";

describe("note visibility window", () => {
  it("shows a note slightly before and a few seconds after its time", () => {
    expect(isNoteVisibleAt(10_000, 10_000 - NOTE_VISIBLE_BEFORE_MS)).toBe(true);
    expect(isNoteVisibleAt(10_000, 10_000 - NOTE_VISIBLE_BEFORE_MS - 1)).toBe(false);
    expect(isNoteVisibleAt(10_000, 10_000 + NOTE_VISIBLE_AFTER_MS)).toBe(true);
    expect(isNoteVisibleAt(10_000, 10_000 + NOTE_VISIBLE_AFTER_MS + 1)).toBe(false);
  });

  it("returns only visible ids, in the order given", () => {
    const notes = [
      { id: "a", timestampMs: 1_000 },
      { id: "b", timestampMs: 2_000 },
      { id: "c", timestampMs: 60_000 },
    ];
    expect(visibleNoteIds(notes, 1_500)).toEqual(["a", "b"]);
    expect(visibleNoteIds(notes, 30_000)).toEqual([]);
  });

  it("compares id lists so unchanged results can skip a re-render", () => {
    expect(sameIds(["a", "b"], ["a", "b"])).toBe(true);
    expect(sameIds(["a"], ["a", "b"])).toBe(false);
    expect(sameIds(["a", "b"], ["b", "a"])).toBe(false);
  });

  it("places timeline markers as a percentage and handles an unknown length", () => {
    expect(timelinePercent(30_000, 120_000)).toBe(25);
    expect(timelinePercent(500_000, 120_000)).toBe(100);
    expect(timelinePercent(1, null)).toBeNull();
    expect(timelinePercent(1, 0)).toBeNull();
  });
});
