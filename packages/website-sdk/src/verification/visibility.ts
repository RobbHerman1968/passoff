import type { VerificationOutcome } from "./contract";
import { VISIBILITY_VIEWPORT_REQUIRED } from "./contract";

export type VisibilityMeasurements = {
  connected: boolean;
  width: number;
  height: number;
  display: string;
  visibility: string;
  opacity: number;
  inViewport: boolean;
  clipped: boolean;
  inert: boolean;
  hidden: boolean;
};

function effectiveOpacity(element: Element): number {
  let opacity = 1;
  let current: Element | null = element;
  while (current) {
    const style = window.getComputedStyle(current);
    const value = Number.parseFloat(style.opacity);
    opacity *= Number.isFinite(value) ? value : 1;
    current = current.parentElement;
  }
  return opacity;
}

function hiddenByAncestor(element: Element): boolean {
  let current: Element | null = element;
  while (current) {
    if (current instanceof HTMLElement && current.hidden) return true;
    const style = window.getComputedStyle(current);
    if (style.display === "none") return true;
    if (style.visibility === "hidden" || style.visibility === "collapse") return true;
    current = current.parentElement;
  }
  return false;
}

function isClipped(element: Element): boolean {
  const rect = element.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return true;
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  const top = document.elementFromPoint(cx, cy);
  if (!top) return true;
  return !(element === top || element.contains(top) || top.contains(element));
}

function inViewport(rect: DOMRect): boolean {
  return (
    rect.bottom > 0 &&
    rect.right > 0 &&
    rect.top < window.innerHeight &&
    rect.left < window.innerWidth
  );
}

export function evaluateVisibility(element: Element): {
  outcome: VerificationOutcome;
  measurements: VisibilityMeasurements;
  limitations: string[];
} {
  const rect = element.getBoundingClientRect();
  const style = window.getComputedStyle(element);
  const connected = element.isConnected;
  const measurements: VisibilityMeasurements = {
    connected,
    width: rect.width,
    height: rect.height,
    display: style.display,
    visibility: style.visibility,
    opacity: effectiveOpacity(element),
    inViewport: inViewport(rect),
    clipped: isClipped(element),
    inert: Boolean((element as HTMLElement).inert || element.closest("[inert]")),
    hidden:
      (element instanceof HTMLElement && element.hidden) ||
      element.getAttribute("aria-hidden") === "true" ||
      hiddenByAncestor(element),
  };

  if (!connected) {
    return { outcome: "failed", measurements, limitations: [] };
  }
  if (element.ownerDocument !== document) {
    return {
      outcome: "uncertain",
      measurements,
      limitations: ["The element is not in this document."],
    };
  }

  const visiblyHidden =
    measurements.display === "none" ||
    measurements.visibility === "hidden" ||
    measurements.visibility === "collapse" ||
    measurements.opacity === 0 ||
    measurements.width <= 0 ||
    measurements.height <= 0 ||
    measurements.hidden ||
    measurements.inert;

  if (visiblyHidden) {
    return { outcome: "failed", measurements, limitations: [] };
  }
  if (VISIBILITY_VIEWPORT_REQUIRED && !measurements.inViewport) {
    return { outcome: "failed", measurements, limitations: [] };
  }
  if (measurements.clipped) {
    return { outcome: "failed", measurements, limitations: [] };
  }
  return { outcome: "passed", measurements, limitations: [] };
}
