import { LAYOUT_STABILITY } from "./contract";
import { prefersReducedMotion } from "../dom";

function center(rect: DOMRect): { x: number; y: number } {
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}

export function wait(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

export async function isLayoutStable(element: Element): Promise<boolean> {
  if (!element.isConnected) return false;
  const first = element.getBoundingClientRect();
  const delay = prefersReducedMotion() ? 16 : LAYOUT_STABILITY.sampleDelayMs;
  await wait(delay);
  if (!element.isConnected) return false;
  const second = element.getBoundingClientRect();
  const a = center(first);
  const b = center(second);
  const delta = Math.hypot(a.x - b.x, a.y - b.y);
  if (delta > LAYOUT_STABILITY.maxCenterDeltaPx) return false;
  const size =
    Math.max(first.width, second.width) === 0
      ? 0
      : Math.abs(first.width - second.width) / Math.max(first.width, 1);
  const height =
    Math.max(first.height, second.height) === 0
      ? 0
      : Math.abs(first.height - second.height) / Math.max(first.height, 1);
  return (
    size <= LAYOUT_STABILITY.maxSizeDeltaRatio &&
    height <= LAYOUT_STABILITY.maxSizeDeltaRatio
  );
}

export function documentLooksReady(): boolean {
  return document.readyState === "complete" || document.readyState === "interactive";
}
