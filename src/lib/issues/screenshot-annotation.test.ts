import { describe, expect, it } from "vitest";

import { parseScreenshotAnnotation } from "@/lib/issues/screenshot-annotation";
import { sanitizeScreenshot } from "@/lib/sdk/sanitize";

const TINY_PNG =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

const validAnnotation = {
  version: 1 as const,
  selectedBounds: { x: 0.1, y: 0.2, width: 0.3, height: 0.4 },
  pin: { x: 0.25, y: 0.35 },
};

describe("screenshot annotation sanitization", () => {
  it("accepts a valid version-1 annotation with a screenshot", () => {
    const result = sanitizeScreenshot({
      status: "captured",
      reason: "ok",
      dataUrl: `data:image/png;base64,${TINY_PNG}`,
      annotation: validAnnotation,
    });
    expect(result.status).toBe("captured");
    expect(result.annotation).toEqual(validAnnotation);
    expect(parseScreenshotAnnotation(validAnnotation)).toEqual(validAnnotation);
  });

  it("rejects NaN, Infinity, strings, and missing values", () => {
    expect(
      parseScreenshotAnnotation({
        version: 1,
        selectedBounds: { x: Number.NaN, y: 0.1, width: 0.2, height: 0.2 },
        pin: { x: 0.1, y: 0.1 },
      }),
    ).toBeNull();

    expect(
      parseScreenshotAnnotation({
        version: 1,
        selectedBounds: { x: 0.1, y: Number.POSITIVE_INFINITY, width: 0.2, height: 0.2 },
        pin: { x: 0.1, y: 0.1 },
      }),
    ).toBeNull();

    expect(
      parseScreenshotAnnotation({
        version: 1,
        selectedBounds: { x: "0.1", y: 0.1, width: 0.2, height: 0.2 },
        pin: { x: 0.1, y: 0.1 },
      }),
    ).toBeNull();

    expect(
      parseScreenshotAnnotation({
        version: 1,
        selectedBounds: { x: 0.1, y: 0.1, width: 0.2 },
        pin: { x: 0.1, y: 0.1 },
      }),
    ).toBeNull();
  });

  it("rejects out-of-range coordinates and bounds past 1", () => {
    expect(
      parseScreenshotAnnotation({
        version: 1,
        selectedBounds: { x: -0.1, y: 0.1, width: 0.2, height: 0.2 },
        pin: { x: 0.1, y: 0.1 },
      }),
    ).toBeNull();

    expect(
      parseScreenshotAnnotation({
        version: 1,
        selectedBounds: { x: 0.8, y: 0.1, width: 0.3, height: 0.2 },
        pin: { x: 0.1, y: 0.1 },
      }),
    ).toBeNull();

    expect(
      parseScreenshotAnnotation({
        version: 1,
        selectedBounds: { x: 0.1, y: 0.1, width: 0, height: 0.2 },
        pin: { x: 0.1, y: 0.1 },
      }),
    ).toBeNull();
  });

  it("keeps a valid screenshot when annotation is invalid", () => {
    const result = sanitizeScreenshot({
      status: "captured",
      reason: "ok",
      dataUrl: `data:image/png;base64,${TINY_PNG}`,
      annotation: {
        version: 1,
        selectedBounds: { x: 2, y: 0.1, width: 0.2, height: 0.2 },
        pin: { x: 0.1, y: 0.1 },
      },
    });
    expect(result.status).toBe("captured");
    expect(result.base64).toBe(TINY_PNG);
    expect(result.annotation).toBeNull();
  });

  it("treats unknown annotation versions as unavailable metadata", () => {
    expect(
      parseScreenshotAnnotation({
        version: 2,
        selectedBounds: { x: 0.1, y: 0.1, width: 0.2, height: 0.2 },
        pin: { x: 0.1, y: 0.1 },
      }),
    ).toBeNull();

    const result = sanitizeScreenshot({
      status: "captured",
      dataUrl: `data:image/png;base64,${TINY_PNG}`,
      annotation: {
        version: 99,
        selectedBounds: { x: 0.1, y: 0.1, width: 0.2, height: 0.2 },
        pin: { x: 0.1, y: 0.1 },
      },
    });
    expect(result.annotation).toBeNull();
    expect(result.base64).toBe(TINY_PNG);
  });

  it("does not attach annotation when the screenshot is unavailable", () => {
    const result = sanitizeScreenshot({
      status: "unavailable",
      reason: "failed",
      annotation: validAnnotation,
    });
    expect(result.status).toBe("unavailable");
    expect(result.annotation).toBeNull();
  });
});
