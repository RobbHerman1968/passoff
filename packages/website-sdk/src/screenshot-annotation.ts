import { clamp01 } from "./dom";
import { isPrivateElement } from "./privacy";
import type { ScreenshotAnnotation } from "./types";

export type AnnotationClickPosition = {
  /** Normalized click X within the selected element (0–1). */
  x: number;
  /** Normalized click Y within the selected element (0–1). */
  y: number;
};

/**
 * Build version-1 screenshot annotation coordinates relative to the
 * contextual capture target. Values are normalized 0–1 so they remain
 * valid at any later rendered image size.
 */
export function buildScreenshotAnnotation(
  selected: Element,
  captureTarget: HTMLElement,
  clickPosition?: AnnotationClickPosition,
): ScreenshotAnnotation | undefined {
  if (isPrivateElement(selected)) {
    return undefined;
  }

  const selectedRect = selected.getBoundingClientRect();
  const targetRect = captureTarget.getBoundingClientRect();

  if (
    !Number.isFinite(targetRect.width) ||
    !Number.isFinite(targetRect.height) ||
    targetRect.width <= 0 ||
    targetRect.height <= 0
  ) {
    return undefined;
  }

  // Clip the selected element to the capture target, then normalize.
  const leftPx = Math.max(selectedRect.left, targetRect.left);
  const topPx = Math.max(selectedRect.top, targetRect.top);
  const rightPx = Math.min(selectedRect.right, targetRect.right);
  const bottomPx = Math.min(selectedRect.bottom, targetRect.bottom);

  const widthPx = rightPx - leftPx;
  const heightPx = bottomPx - topPx;
  if (widthPx <= 0 || heightPx <= 0) {
    return undefined;
  }

  const x = clamp01((leftPx - targetRect.left) / targetRect.width);
  const y = clamp01((topPx - targetRect.top) / targetRect.height);
  let width = widthPx / targetRect.width;
  let height = heightPx / targetRect.height;

  // Keep bounds inside the image after floating-point noise.
  width = Math.min(Math.max(width, Number.EPSILON), 1 - x);
  height = Math.min(Math.max(height, Number.EPSILON), 1 - y);
  if (width <= 0 || height <= 0) {
    return undefined;
  }

  const clickX = clamp01(clickPosition?.x ?? 0.5);
  const clickY = clamp01(clickPosition?.y ?? 0.5);
  const selectedWidth = selectedRect.width > 0 ? selectedRect.width : 1;
  const selectedHeight = selectedRect.height > 0 ? selectedRect.height : 1;

  const pin = {
    x: clamp01(
      (selectedRect.left -
        targetRect.left +
        clickX * selectedWidth) /
        targetRect.width,
    ),
    y: clamp01(
      (selectedRect.top -
        targetRect.top +
        clickY * selectedHeight) /
        targetRect.height,
    ),
  };

  return {
    version: 1,
    selectedBounds: { x, y, width, height },
    pin,
  };
}
