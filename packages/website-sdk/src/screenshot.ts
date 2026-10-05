import { toPng } from "html-to-image";

import { isPrivateElement } from "./privacy";
import {
  buildScreenshotAnnotation,
  type AnnotationClickPosition,
} from "./screenshot-annotation";
import { HOST_ROOT_ID } from "./styles";
import type { ScreenshotResult, ScreenshotStatus } from "./types";

export type ScreenshotAttemptInput = {
  element: Element;
  /**
   * Click position within the selected element (normalized 0–1).
   * Used to place the issue-number pin inside the contextual screenshot.
   */
  clickPosition?: AnnotationClickPosition;
  /** Prototype seam: inject failure without throwing into the host. */
  forceUnavailable?: boolean;
};

const USER_REASONS: Record<string, string> = {
  video: "This area includes a video, so Passoff couldn't capture a complete picture.",
  canvas: "This area includes a drawing surface that the browser won't share in a picture.",
  iframe:
    "This area includes another embedded page, so Passoff couldn't capture a complete picture.",
  cors: "An image on this page comes from another website that doesn't allow capture.",
  private: "A private area was hidden from the picture.",
  failed: "Passoff couldn't capture a picture of this page. You can still send your feedback.",
};

const MAX_DATA_URL_CHARS = 280_022;
const CAPTURE_TIMEOUT_MS = 7_000;
const MIN_CONTEXT_WIDTH = 480;
const MIN_CONTEXT_HEIGHT = 240;
const MIN_VERTICAL_GUTTER = 96;
const MAX_VERTICAL_GUTTER = 160;
const MAX_CONTEXT_WIDTH = 2_400;
const MAX_CONTEXT_HEIGHT = 1_600;
const TRANSPARENT_PIXEL =
  "data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=";

function collectLimitations(element: Element): string[] {
  const limitations: string[] = [];
  if (element.closest("video") || element.querySelector("video")) {
    limitations.push("video");
  }
  if (element.closest("canvas") || element.querySelector("canvas")) {
    limitations.push("canvas");
  }
  if (element.closest("iframe") || element.querySelector("iframe")) {
    limitations.push("iframe");
  }
  const images = [
    ...(element instanceof HTMLImageElement ? [element] : []),
    ...Array.from(element.querySelectorAll("img")),
  ];
  for (const image of images) {
    try {
      const src = new URL(image.currentSrc || image.src, window.location.href);
      if (src.origin !== window.location.origin && image.crossOrigin !== "anonymous") {
        limitations.push("cors");
        break;
      }
    } catch {
      limitations.push("cors");
      break;
    }
  }
  if (isPrivateElement(element) || element.querySelector("[data-passoff-private]")) {
    limitations.push("private");
  }
  return Array.from(new Set(limitations));
}

function statusFrom(limitations: string[], captured: boolean): ScreenshotStatus {
  if (!captured) {
    return "unavailable";
  }
  if (limitations.length) {
    return "partially-captured";
  }
  return "captured";
}

function reasonFrom(status: ScreenshotStatus, limitations: string[]): string {
  if (status === "captured") {
    return "Picture captured and ready to send.";
  }
  if (status === "partially-captured") {
    if (limitations.includes("private")) {
      return "Picture captured and ready to send. Private information was left out.";
    }
    return "Picture captured and ready to send, but part of the selected area could not be included.";
  }
  const key = limitations[0] ?? "failed";
  return USER_REASONS[key] ?? USER_REASONS.failed;
}

function canInclude(node: Node): boolean {
  // html-to-image types this callback as HTMLElement, but it invokes the
  // filter for every cloned child, including Text and Comment nodes.
  if (!(node instanceof Element)) {
    return true;
  }
  if (node.id === HOST_ROOT_ID || isPrivateElement(node)) {
    return false;
  }
  if (
    node instanceof HTMLInputElement ||
    node instanceof HTMLTextAreaElement ||
    node instanceof HTMLSelectElement ||
    node instanceof HTMLOptionElement
  ) {
    return false;
  }
  if (
    node instanceof HTMLVideoElement ||
    node instanceof HTMLCanvasElement ||
    node instanceof HTMLIFrameElement ||
    node instanceof HTMLObjectElement ||
    node instanceof HTMLEmbedElement ||
    node instanceof HTMLScriptElement ||
    node.tagName === "NOSCRIPT"
  ) {
    return false;
  }
  if (node instanceof HTMLImageElement) {
    try {
      const src = new URL(node.currentSrc || node.src, window.location.href);
      if (src.origin !== window.location.origin && node.crossOrigin !== "anonymous") {
        return false;
      }
    } catch {
      return false;
    }
  }
  return true;
}

function withTimeout<T>(promise: Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error("capture-timeout")), CAPTURE_TIMEOUT_MS);
    promise.then(
      (value) => {
        window.clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        window.clearTimeout(timer);
        reject(error);
      },
    );
  });
}

function captureTargetFor(element: Element): HTMLElement | null {
  if (isPrivateElement(element)) {
    return null;
  }
  const initial = element instanceof HTMLElement ? element : element.parentElement;
  if (!initial) return null;

  const selectedRect = element.getBoundingClientRect();
  const desiredVerticalGutter = Math.min(
    MAX_VERTICAL_GUTTER,
    Math.max(MIN_VERTICAL_GUTTER, selectedRect.height * 0.75),
  );

  let current: HTMLElement = initial;
  let best = current;
  while (current !== document.body && current !== document.documentElement) {
    const rect = current.getBoundingClientRect();
    const containsSelection =
      rect.top <= selectedRect.top &&
      rect.bottom >= selectedRect.bottom &&
      rect.left <= selectedRect.left &&
      rect.right >= selectedRect.right;
    const spaceAbove = Math.max(0, selectedRect.top - rect.top);
    const spaceBelow = Math.max(0, rect.bottom - selectedRect.bottom);
    const usefulSize =
      rect.width >= MIN_CONTEXT_WIDTH && rect.height >= MIN_CONTEXT_HEIGHT;

    if (usefulSize) {
      // Keep the largest safe candidate as a fallback. Positioned children can
      // legitimately extend outside a parent's box; in that case annotation is
      // omitted rather than losing the contextual picture.
      best = current;
    }

    // Do not accept a merely large parent when the selected item sits against
    // one edge. Keep climbing until there is useful real page context on both
    // sides, or fall back to the best available bounded ancestor.
    if (
      containsSelection &&
      usefulSize &&
      spaceAbove >= desiredVerticalGutter &&
      spaceBelow >= desiredVerticalGutter
    ) {
      return current;
    }
    const parent: HTMLElement | null = current.parentElement;
    if (!parent || parent === document.body || parent === document.documentElement) {
      break;
    }
    const parentRect = parent.getBoundingClientRect();
    if (
      parentRect.width > MAX_CONTEXT_WIDTH ||
      parentRect.height > MAX_CONTEXT_HEIGHT
    ) {
      break;
    }
    current = parent;
  }

  return best;
}

async function drawClone(target: HTMLElement): Promise<string | null> {
  const rect = target.getBoundingClientRect();
  const sourceWidth = Math.max(1, Math.round(rect.width || target.clientWidth));
  const sourceHeight = Math.max(1, Math.round(rect.height || target.clientHeight));
  const scale = Math.min(1, 1200 / sourceWidth, 900 / sourceHeight);
  const canvasWidth = Math.max(1, Math.round(sourceWidth * scale));
  const canvasHeight = Math.max(1, Math.round(sourceHeight * scale));

  // Preserve the host's fonts first. Without them, text can wrap differently
  // inside the reconstructed image and move the selected element away from
  // its recorded annotation. Fall back to system fonts only if embedding is
  // unavailable on the host page.
  for (const skipFonts of [false, true]) {
    for (const pixelRatio of [1, 0.75, 0.5]) {
      try {
        const dataUrl = await withTimeout(
          toPng(target, {
            width: sourceWidth,
            height: sourceHeight,
            canvasWidth,
            canvasHeight,
            // getBoundingClientRect excludes margins, but html-to-image copies
            // the capture root's margin into the SVG. Reset only that cloned
            // root margin so annotation coordinates and PNG origin agree.
            style: { margin: "0" },
            pixelRatio,
            skipFonts,
            cacheBust: false,
            imagePlaceholder: TRANSPARENT_PIXEL,
            filter: canInclude,
            fetchRequestInit: { credentials: "same-origin" },
            onImageErrorHandler: () => undefined,
          }),
        );
        if (
          dataUrl.startsWith("data:image/png;base64,") &&
          dataUrl.length <= MAX_DATA_URL_CHARS
        ) {
          return dataUrl;
        }
      } catch {
        // Pixel ratio cannot repair a font-fetch failure. Move directly to
        // the compatibility fallback instead of waiting through more retries.
        if (!skipFonts) {
          break;
        }
      }
    }
  }
  return null;
}

export async function attemptScreenshot(
  input: ScreenshotAttemptInput,
): Promise<ScreenshotResult> {
  const capturedAt = new Date().toISOString();
  if (input.forceUnavailable) {
    return {
      status: "unavailable",
      reason: USER_REASONS.failed,
      limitations: ["forced"],
      capturedAt,
    };
  }

  const target = captureTargetFor(input.element);
  const limitations = collectLimitations(target ?? input.element);

  // Measure before html-to-image starts its asynchronous reconstruction. The
  // host page can reflow, animate, or scroll while capture is in progress; a
  // later measurement would describe a different layout than the saved image.
  let measuredAnnotation: ScreenshotResult["annotation"];
  if (target) {
    try {
      measuredAnnotation = buildScreenshotAnnotation(
        input.element,
        target,
        input.clickPosition,
      );
    } catch {
      measuredAnnotation = undefined;
    }
  }

  const dataUrl = target ? await drawClone(target) : null;
  const status = statusFrom(limitations, Boolean(dataUrl));

  return {
    status,
    reason: reasonFrom(status, limitations),
    limitations,
    dataUrl: dataUrl ?? undefined,
    annotation: dataUrl ? measuredAnnotation : undefined,
    capturedAt,
  };
}

export const SCREENSHOT_FEATURE_LIMITS = [
  "Cross-origin images without CORS permission are omitted from the picture.",
  "Cross-origin iframes cannot be read by the embedding page.",
  "Video frames are not copied.",
  "Canvas contents may be origin-tainted and are treated as incomplete.",
  "Privacy-marked regions and form fields are removed before capture.",
];
