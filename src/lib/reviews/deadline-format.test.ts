import { describe, expect, it } from "vitest";

import {
  DEADLINE_INVALID_MESSAGE,
  DEADLINE_MAX_LEAD_MS,
  DEADLINE_MIN_LEAD_MS,
  DEADLINE_PAST_MESSAGE,
  DEADLINE_TOO_FAR_MESSAGE,
  dateTimeLocalToIso,
  parseDeadlineInput,
  toDateTimeLocalValue,
} from "@/lib/reviews/deadline-format";

const now = new Date("2026-10-07T12:00:00.000Z");
const at = (ms: number) => new Date(now.getTime() + ms).toISOString();

describe("parseDeadlineInput", () => {
  it("clears on empty input", () => {
    expect(parseDeadlineInput("", now)).toEqual({ ok: true, deadline: null });
    expect(parseDeadlineInput("   ", now)).toEqual({ ok: true, deadline: null });
    expect(parseDeadlineInput(null, now)).toEqual({ ok: true, deadline: null });
  });

  it("accepts a future time", () => {
    const result = parseDeadlineInput(at(DEADLINE_MIN_LEAD_MS + 1000), now);
    expect(result.ok && result.deadline?.toISOString()).toBe(at(DEADLINE_MIN_LEAD_MS + 1000));
  });

  it("explains past, invalid, and far-future values in plain language", () => {
    expect(parseDeadlineInput(at(-60_000), now)).toEqual({
      ok: false,
      message: DEADLINE_PAST_MESSAGE,
    });
    expect(parseDeadlineInput(at(1000), now)).toEqual({
      ok: false,
      message: DEADLINE_PAST_MESSAGE,
    });
    expect(parseDeadlineInput("tomorrow-ish", now)).toEqual({
      ok: false,
      message: DEADLINE_INVALID_MESSAGE,
    });
    expect(parseDeadlineInput(at(DEADLINE_MAX_LEAD_MS + 1000), now)).toEqual({
      ok: false,
      message: DEADLINE_TOO_FAR_MESSAGE,
    });
  });
});

describe("datetime-local helpers", () => {
  it("round-trips local wall-clock time", () => {
    const date = new Date(2026, 9, 8, 17, 30);
    const local = toDateTimeLocalValue(date);
    expect(local).toBe("2026-10-08T17:30");
    expect(new Date(dateTimeLocalToIso(local)).getTime()).toBe(date.getTime());
    expect(dateTimeLocalToIso("")).toBe("");
    expect(toDateTimeLocalValue(null)).toBe("");
  });
});
