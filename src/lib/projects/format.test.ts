import { describe, expect, it } from "vitest";

import { formatRelativeActivity } from "@/lib/projects/format";

describe("formatRelativeActivity", () => {
  const now = Date.parse("2026-10-04T18:00:00.000Z");

  it("uses a stable label for sub-minute activity", () => {
    expect(formatRelativeActivity(new Date(now - 1_000), now)).toBe("Just now");
    expect(formatRelativeActivity(new Date(now - 59_000), now)).toBe("Just now");
  });

  it("formats minute and hour activity", () => {
    expect(formatRelativeActivity(new Date(now - 5 * 60_000), now)).toBe(
      "5 minutes ago",
    );
    expect(formatRelativeActivity(new Date(now - 2 * 3_600_000), now)).toBe(
      "2 hours ago",
    );
  });

  it("returns a calendar date for older activity", () => {
    expect(
      formatRelativeActivity(new Date("2025-01-15T12:00:00.000Z"), now),
    ).toBe("Jan 15, 2025");
  });
});
