import { isPrivateElement } from "./privacy";
import type { ScreenshotResult, ScreenshotStatus } from "./types";

export type ScreenshotAttemptInput = {
  element: Element;
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
    return "Passoff captured a picture of this area.";
  }
  const key = limitations[0] ?? "failed";
  return USER_REASONS[key] ?? USER_REASONS.failed;
}

async function drawClone(element: Element): Promise<string | null> {
  const rect = element.getBoundingClientRect();
  const width = Math.max(1, Math.round(rect.width));
  const height = Math.max(1, Math.round(rect.height));
  const clone = element.cloneNode(true) as Element;
  clone.querySelectorAll("[data-passoff-private], input[type='password']").forEach((node) => {
    node.replaceWith(document.createComment("passoff-redacted"));
  });
  const serialized = new XMLSerializer().serializeToString(clone);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
    <foreignObject width="100%" height="100%">
      <div xmlns="http://www.w3.org/1999/xhtml">${serialized}</div>
    </foreignObject>
  </svg>`;
  const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  try {
    const image = new Image();
    image.decoding = "sync";
    const loaded = new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("image"));
    });
    image.src = url;
    await Promise.race([
      loaded,
      new Promise<void>((_, reject) => {
        window.setTimeout(() => reject(new Error("timeout")), 80);
      }),
    ]);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) {
      return null;
    }
    context.drawImage(image, 0, 0, width, height);
    return canvas.toDataURL("image/png");
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
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

  const limitations = collectLimitations(input.element);
  const dataUrl = await drawClone(input.element);
  const status = statusFrom(limitations, Boolean(dataUrl));
  return {
    status,
    reason: reasonFrom(status, limitations),
    limitations,
    dataUrl: dataUrl ?? undefined,
    capturedAt,
  };
}

export const SCREENSHOT_FEATURE_LIMITS = [
  "Cross-origin images without CORS permission taint or omit visual content.",
  "Cross-origin iframes cannot be read by the embedding page.",
  "Video frames are not copied by this prototype.",
  "Canvas contents may be origin-tainted and are treated as incomplete.",
  "Privacy-marked regions and password fields are removed before capture.",
];
