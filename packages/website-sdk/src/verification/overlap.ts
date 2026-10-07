import { HOST_ROOT_ID } from "../styles";
import { overlapDecision, type VerificationOutcome } from "./contract";

export type OverlapMeasurements = {
  sampledPoints: number;
  uncoveredPoints: number;
  occlusionPercent: number;
  coverCategory: string;
  coverPlacement: string;
  pointerEventsNone: boolean;
  viewportWidth: number;
  viewportHeight: number;
  width: number;
  height: number;
};

const SAMPLE_INSET = 2;

function samplePoints(rect: DOMRect): Array<{ x: number; y: number }> {
  const insetX = Math.min(SAMPLE_INSET, Math.max(0, rect.width / 4));
  const insetY = Math.min(SAMPLE_INSET, Math.max(0, rect.height / 4));
  const points = [
    { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 },
    { x: rect.left + insetX, y: rect.top + insetY },
    { x: rect.right - insetX, y: rect.top + insetY },
    { x: rect.left + insetX, y: rect.bottom - insetY },
    { x: rect.right - insetX, y: rect.bottom - insetY },
  ];
  if (rect.width > 160 || rect.height > 160) {
    points.push(
      { x: rect.left + rect.width / 2, y: rect.top + insetY },
      { x: rect.left + rect.width / 2, y: rect.bottom - insetY },
      { x: rect.left + insetX, y: rect.top + rect.height / 2 },
      { x: rect.right - insetX, y: rect.top + rect.height / 2 },
    );
  }
  return points;
}

function classifyCover(element: Element | null): {
  category: string;
  placement: string;
  safe: boolean;
} {
  if (!element) {
    return { category: "none", placement: "none", safe: true };
  }
  const style = window.getComputedStyle(element);
  const role = element.getAttribute("role");
  const placement =
    style.position === "fixed"
      ? "fixed"
      : style.position === "sticky"
        ? "sticky"
        : role === "dialog" || element.getAttribute("aria-modal") === "true"
          ? "modal"
          : "content";
  const category =
    placement === "modal"
      ? "dialog"
      : placement === "sticky" || placement === "fixed"
        ? "page_region"
        : "content";
  return { category, placement, safe: true };
}

function isPassoffUi(node: Element | null): boolean {
  if (!node) return false;
  if (node.id === HOST_ROOT_ID || node.closest(`#${HOST_ROOT_ID}`)) return true;
  if (node.getAttribute("data-passoff-ui") === "true") return true;
  const root = node.getRootNode();
  return root instanceof ShadowRoot && (root.host as Element).id === HOST_ROOT_ID;
}

function isIgnoredCover(hit: Element, target: Element): boolean {
  if (hit === target || target.contains(hit) || hit.contains(target)) return true;
  if (isPassoffUi(hit)) return true;
  if (hit.getAttribute("data-passoff-exclude-verification") === "true") return true;
  const style = window.getComputedStyle(hit);
  if (style.visibility === "hidden" || style.display === "none") return true;
  return false;
}

export function evaluateOverlap(target: Element): {
  outcome: VerificationOutcome;
  measurements: OverlapMeasurements;
  limitations: string[];
} {
  const rect = target.getBoundingClientRect();
  const points = samplePoints(rect);
  let uncovered = 0;
  let cover: Element | null = null;
  let pointerEventsNone = false;

  for (const point of points) {
    const hit = document.elementFromPoint(point.x, point.y);
    if (!hit || isIgnoredCover(hit, target)) {
      uncovered += 1;
      continue;
    }
    const style = window.getComputedStyle(hit);
    if (style.pointerEvents === "none") {
      pointerEventsNone = true;
      uncovered += 1;
      if (!cover) cover = hit;
      continue;
    }
    if (!cover) cover = hit;
  }

  const occlusionPercent =
    points.length === 0 ? 100 : ((points.length - uncovered) / points.length) * 100;
  const classified = classifyCover(cover);
  const measurements: OverlapMeasurements = {
    sampledPoints: points.length,
    uncoveredPoints: uncovered,
    occlusionPercent,
    coverCategory: classified.category,
    coverPlacement: classified.placement,
    pointerEventsNone,
    viewportWidth: window.innerWidth,
    viewportHeight: window.innerHeight,
    width: rect.width,
    height: rect.height,
  };

  if (!classified.safe) {
    return {
      outcome: "uncertain",
      measurements,
      limitations: ["The covering element couldn’t be classified safely."],
    };
  }

  return {
    outcome: overlapDecision(occlusionPercent),
    measurements,
    limitations: pointerEventsNone
      ? ["A see-through overlay was present but it doesn’t block interaction."]
      : [],
  };
}
