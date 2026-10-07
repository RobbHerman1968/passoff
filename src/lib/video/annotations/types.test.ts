import { describe, expect, it } from "vitest";

import { videoNoteVideoStateFor } from "@/lib/video/annotations/state";
import {
  checkVideoNoteInput,
  clampVideoTimestamp,
  formatVideoTimestamp,
  numberVideoNotes,
  parseVideoTimestamp,
  spokenVideoTimestamp,
  videoNoteAccessibleName,
  videoNoteHistoricalWarning,
  videoNoteLabel,
  videoNoteVideoStateLabel,
} from "@/lib/video/annotations/types";

describe("timestamps", () => {
  it("formats like a video player", () => {
    expect(formatVideoTimestamp(0)).toBe("0:00");
    expect(formatVideoTimestamp(42_900)).toBe("0:42");
    expect(formatVideoTimestamp(65_000)).toBe("1:05");
    expect(formatVideoTimestamp(3_723_000)).toBe("1:02:03");
    expect(formatVideoTimestamp(-5)).toBe("0:00");
  });

  it("speaks the time in words", () => {
    expect(spokenVideoTimestamp(1_000)).toBe("1 second");
    expect(spokenVideoTimestamp(42_000)).toBe("42 seconds");
    expect(spokenVideoTimestamp(65_000)).toBe("1 minute 5 seconds");
    expect(spokenVideoTimestamp(120_000)).toBe("2 minutes");
  });

  it("reads what people type", () => {
    expect(parseVideoTimestamp("42")).toBe(42_000);
    expect(parseVideoTimestamp("0:42")).toBe(42_000);
    expect(parseVideoTimestamp(" 1:05 ")).toBe(65_000);
    expect(parseVideoTimestamp("1:05.5")).toBe(65_500);
    expect(parseVideoTimestamp("1:02:03")).toBe(3_723_000);
    expect(parseVideoTimestamp("1:75")).toBeNull();
    expect(parseVideoTimestamp("soon")).toBeNull();
    expect(parseVideoTimestamp("")).toBeNull();
  });

  it("keeps a time inside the clip", () => {
    expect(clampVideoTimestamp(-10, 60_000)).toBe(0);
    expect(clampVideoTimestamp(90_000, 60_000)).toBe(60_000);
    expect(clampVideoTimestamp(90_000, null)).toBe(90_000);
  });
});

describe("checkVideoNoteInput", () => {
  it("accepts a time with no pin", () => {
    expect(checkVideoNoteInput({ timestampMs: 5_000, durationMs: 60_000 })).toEqual({
      ok: true,
      value: { timestampMs: 5_000, x: null, y: null },
    });
  });

  it("accepts a pin and rounds it to stored precision", () => {
    const result = checkVideoNoteInput({
      timestampMs: 1_000.4,
      x: 0.123456789,
      y: 1,
      durationMs: 60_000,
    });
    expect(result).toEqual({ ok: true, value: { timestampMs: 1_000, x: 0.1234568, y: 1 } });
  });

  it("rejects a time that is not a number or is negative", () => {
    for (const timestampMs of [-1, NaN, Infinity, "5", null]) {
      expect(checkVideoNoteInput({ timestampMs, durationMs: 60_000 })).toEqual({
        ok: false,
        problem: "timestamp_invalid",
      });
    }
  });

  it("rejects a time after the end, with a little slack for the last frames", () => {
    expect(checkVideoNoteInput({ timestampMs: 60_400, durationMs: 60_000 })).toEqual({
      ok: true,
      value: { timestampMs: 60_000, x: null, y: null },
    });
    expect(checkVideoNoteInput({ timestampMs: 61_000, durationMs: 60_000 })).toEqual({
      ok: false,
      problem: "timestamp_out_of_range",
    });
  });

  it("rejects a pin with only one coordinate or one outside the picture", () => {
    expect(checkVideoNoteInput({ timestampMs: 1, x: 0.5, durationMs: null })).toEqual({
      ok: false,
      problem: "pin_incomplete",
    });
    expect(checkVideoNoteInput({ timestampMs: 1, x: 1.2, y: 0.5, durationMs: null })).toEqual({
      ok: false,
      problem: "pin_invalid",
    });
    expect(checkVideoNoteInput({ timestampMs: 1, x: "a", y: 0.5, durationMs: null })).toEqual({
      ok: false,
      problem: "pin_invalid",
    });
  });
});

describe("numbering and names", () => {
  const base = { createdAt: "2026-10-07T10:00:00.000Z" };

  it("numbers per clip in time order", () => {
    const numbered = numberVideoNotes([
      { id: "c", videoAssetId: "v1", timestampMs: 9_000, ...base },
      { id: "a", videoAssetId: "v1", timestampMs: 1_000, ...base },
      { id: "z", videoAssetId: "v2", timestampMs: 500, ...base },
      { id: "b", videoAssetId: "v1", timestampMs: 5_000, ...base },
    ]);
    expect(numbered.map((n) => [n.id, n.number])).toEqual([
      ["a", 1],
      ["b", 2],
      ["c", 3],
      ["z", 1],
    ]);
  });

  it("breaks ties by creation time, then id", () => {
    const numbered = numberVideoNotes([
      { id: "b", videoAssetId: "v1", timestampMs: 1_000, createdAt: "2026-10-07T10:00:01.000Z" },
      { id: "a", videoAssetId: "v1", timestampMs: 1_000, createdAt: "2026-10-07T10:00:00.000Z" },
    ]);
    expect(numbered.map((n) => n.id)).toEqual(["a", "b"]);
  });

  it("builds readable names for pins", () => {
    expect(videoNoteLabel({ number: 2, timestampMs: 65_000 })).toBe("Note 2 at 1:05");
    expect(
      videoNoteAccessibleName({
        number: 1,
        timestampMs: 1_000,
        body: "The logo is cut off",
        visibility: "private",
      }),
    ).toBe("Note 1 at 0:01, private note: The logo is cut off");
    const long = videoNoteAccessibleName({
      number: 1,
      timestampMs: 0,
      body: "x".repeat(200),
      visibility: "public",
    });
    expect(long.endsWith("…")).toBe(true);
    expect(long.length).toBeLessThan(90);
  });

  it("labels and warns for clips that cannot be watched", () => {
    expect(videoNoteVideoStateLabel("current")).toBeNull();
    expect(videoNoteVideoStateLabel("replaced")).toBe("Earlier video");
    expect(videoNoteHistoricalWarning("current")).toBeNull();
    expect(videoNoteHistoricalWarning("replaced")).toMatch(/replaced/);
    expect(videoNoteHistoricalWarning("expired")).toMatch(/retention/);
    expect(videoNoteHistoricalWarning("removed")).toMatch(/removed/);
  });
});

describe("videoNoteVideoStateFor", () => {
  it("maps lifecycle and reason", () => {
    expect(videoNoteVideoStateFor("current", null)).toBe("current");
    expect(videoNoteVideoStateFor("replacement", null)).toBe("current");
    expect(videoNoteVideoStateFor("retired", "replaced")).toBe("replaced");
    expect(videoNoteVideoStateFor("retired", "superseded")).toBe("replaced");
    expect(videoNoteVideoStateFor("removed", "retention_expired")).toBe("expired");
    expect(videoNoteVideoStateFor("removed", "user_removed")).toBe("removed");
    expect(videoNoteVideoStateFor("removed", null)).toBe("removed");
  });
});
