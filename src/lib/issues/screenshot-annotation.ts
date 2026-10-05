/**
 * Versioned screenshot annotation stored with issue evidence.
 * Coordinates are normalized 0–1 relative to the contextual screenshot.
 */
export type ScreenshotAnnotationV1 = {
  version: 1;
  selectedBounds: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  pin: {
    x: number;
    y: number;
  };
};

export type ScreenshotAnnotation = ScreenshotAnnotationV1;

function isUnit(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1;
}

/**
 * Validate SDK-provided annotation metadata. Invalid shapes return null so
 * an otherwise valid screenshot can still be saved without annotation.
 */
export function parseScreenshotAnnotation(
  raw: unknown,
): ScreenshotAnnotationV1 | null {
  if (!raw || typeof raw !== "object") return null;
  const input = raw as Record<string, unknown>;

  if (input.version !== 1) return null;

  const bounds =
    input.selectedBounds && typeof input.selectedBounds === "object"
      ? (input.selectedBounds as Record<string, unknown>)
      : null;
  const pin =
    input.pin && typeof input.pin === "object"
      ? (input.pin as Record<string, unknown>)
      : null;

  if (!bounds || !pin) return null;

  const x = bounds.x;
  const y = bounds.y;
  const width = bounds.width;
  const height = bounds.height;
  const pinX = pin.x;
  const pinY = pin.y;

  if (
    !isUnit(x) ||
    !isUnit(y) ||
    !isUnit(width) ||
    !isUnit(height) ||
    !isUnit(pinX) ||
    !isUnit(pinY)
  ) {
    return null;
  }

  if (width <= 0 || height <= 0) return null;
  if (x + width > 1 + Number.EPSILON) return null;
  if (y + height > 1 + Number.EPSILON) return null;

  return {
    version: 1,
    selectedBounds: { x, y, width, height },
    pin: { x: pinX, y: pinY },
  };
}
