/**
 * Where the picture really is inside a player, and how a pin maps onto it. A pin is stored
 * as a fraction of the picture itself (0 to 1), so it stays put when the player is resized,
 * shown full screen, zoomed, or viewed on a sharper screen. Black bars and the player's
 * controls are never part of the picture.
 */

export type Size = { width: number; height: number };
export type Point = { x: number; y: number };
export type Rect = { left: number; top: number; width: number; height: number };

function positive(size: Size): boolean {
  return (
    Number.isFinite(size.width) &&
    Number.isFinite(size.height) &&
    size.width > 0 &&
    size.height > 0
  );
}

/**
 * The area the picture covers when it is fitted inside a box without cropping (the way a
 * video element draws it). Coordinates are relative to the box's top-left corner.
 * Returns null until both sizes are known.
 */
export function containedContentRect(box: Size, video: Size): Rect | null {
  if (!positive(box) || !positive(video)) return null;
  const scale = Math.min(box.width / video.width, box.height / video.height);
  const width = video.width * scale;
  const height = video.height * scale;
  return {
    left: (box.width - width) / 2,
    top: (box.height - height) / 2,
    width,
    height,
  };
}

export function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

/**
 * Turns a point (relative to the same box as `content`) into a position inside the picture.
 * A point in the black bars is outside the picture and returns null, unless `clampToEdge`
 * is set, which snaps it to the nearest edge.
 */
export function pointToNormalized(
  point: Point,
  content: Rect,
  options: { clampToEdge?: boolean } = {},
): Point | null {
  if (content.width <= 0 || content.height <= 0) return null;
  const x = (point.x - content.left) / content.width;
  const y = (point.y - content.top) / content.height;
  const inside = x >= 0 && x <= 1 && y >= 0 && y <= 1;
  if (!inside && !options.clampToEdge) return null;
  return { x: clamp01(x), y: clamp01(y) };
}

/** The reverse: where a saved pin sits inside the box that holds the picture. */
export function normalizedToPoint(normalized: Point, content: Rect): Point {
  return {
    x: content.left + clamp01(normalized.x) * content.width,
    y: content.top + clamp01(normalized.y) * content.height,
  };
}

/**
 * Converts a pointer position from the screen into a position inside the picture.
 * `boxRect` is the player box as the browser reports it (getBoundingClientRect), which is
 * already in on-screen pixels, so page zoom and screen sharpness cancel out.
 */
export function clientPointToNormalized(
  client: Point,
  boxRect: { left: number; top: number; width: number; height: number },
  video: Size,
  options: { clampToEdge?: boolean } = {},
): Point | null {
  const content = containedContentRect({ width: boxRect.width, height: boxRect.height }, video);
  if (!content) return null;
  return pointToNormalized(
    { x: client.x - boxRect.left, y: client.y - boxRect.top },
    content,
    options,
  );
}

export function rectsEqual(a: Rect | null, b: Rect | null, tolerance = 0.5): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    Math.abs(a.left - b.left) <= tolerance &&
    Math.abs(a.top - b.top) <= tolerance &&
    Math.abs(a.width - b.width) <= tolerance &&
    Math.abs(a.height - b.height) <= tolerance
  );
}

/** Moves a draft pin with the arrow keys. A plain press moves 1%; with Shift, 10%. */
export function nudgeNormalized(
  current: Point,
  key: string,
  shift: boolean,
): Point | null {
  const step = shift ? 0.1 : 0.01;
  switch (key) {
    case "ArrowLeft":
      return { x: clamp01(current.x - step), y: current.y };
    case "ArrowRight":
      return { x: clamp01(current.x + step), y: current.y };
    case "ArrowUp":
      return { x: current.x, y: clamp01(current.y - step) };
    case "ArrowDown":
      return { x: current.x, y: clamp01(current.y + step) };
    case "Home":
      return { x: 0, y: current.y };
    case "End":
      return { x: 1, y: current.y };
    default:
      return null;
  }
}
