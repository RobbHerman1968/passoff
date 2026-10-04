import { ANCHOR_DATA_ATTRIBUTES, NEARBY_TEXT_LIMIT, type PrototypeAnchor } from "./types";
import {
  ancestryFingerprint,
  clamp01,
  cssSelectorFor,
  describeEnvironment,
  getAccessibleName,
  getAccessibleRole,
  routeFromUrl,
} from "./dom";
import { isPrivateElement, redactIfPrivate, shouldRedactText } from "./privacy";

function nearbyVisibleText(element: Element): string {
  if (shouldRedactText(element)) {
    return "";
  }
  const pieces: string[] = [];
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const node = walker.currentNode;
    const parent = node.parentElement;
    if (!parent || shouldRedactText(parent)) {
      continue;
    }
    const style = window.getComputedStyle(parent);
    if (style.display === "none" || style.visibility === "hidden") {
      continue;
    }
    const text = node.textContent?.replace(/\s+/g, " ").trim();
    if (text) {
      pieces.push(text);
    }
    if (pieces.join(" ").length >= NEARBY_TEXT_LIMIT) {
      break;
    }
  }
  return pieces.join(" ").slice(0, NEARBY_TEXT_LIMIT);
}

function approvedDataAttributes(element: Element): Record<string, string> {
  const result: Record<string, string> = {};
  for (const name of ANCHOR_DATA_ATTRIBUTES) {
    const value = element.getAttribute(name);
    if (value) {
      result[name] = value;
    }
  }
  return result;
}

function stableId(element: Element): string | null {
  if (!element.id) {
    return null;
  }
  if (element.id.toLowerCase().includes("password")) {
    return null;
  }
  return element.id;
}

export function captureAnchor(
  element: Element,
  point: { x: number; y: number },
  options?: { buildId?: string | null },
): PrototypeAnchor {
  const rect = element.getBoundingClientRect();
  const width = rect.width || 1;
  const height = rect.height || 1;
  const privateCapture = isPrivateElement(element);
  const name = redactIfPrivate(getAccessibleName(element) ?? "", element);

  return {
    pageUrl: window.location.href,
    route: routeFromUrl(window.location.href),
    pageTitle: document.title,
    elementTag: element.tagName.toLowerCase(),
    accessibleRole: getAccessibleRole(element),
    accessibleName: name || null,
    nearbyVisibleText: nearbyVisibleText(element),
    stableElementId: privateCapture ? null : stableId(element),
    approvedDataAttributes: privateCapture ? {} : approvedDataAttributes(element),
    cssSelector: cssSelectorFor(element),
    ancestryFingerprint: ancestryFingerprint(element),
    normalizedPosition: {
      x: clamp01((point.x - rect.left) / width),
      y: clamp01((point.y - rect.top) / height),
    },
    documentPosition: {
      x: Math.round(rect.left + window.scrollX + (point.x - rect.left)),
      y: Math.round(rect.top + window.scrollY + (point.y - rect.top)),
    },
    elementBounds: {
      x: Math.round(rect.left + window.scrollX),
      y: Math.round(rect.top + window.scrollY),
      width: Math.round(rect.width),
      height: Math.round(rect.height),
    },
    viewport: {
      width: window.innerWidth,
      height: window.innerHeight,
    },
    devicePixelRatio: window.devicePixelRatio || 1,
    environment: describeEnvironment(),
    hostBuildId: options?.buildId ?? null,
    capturedAt: new Date().toISOString(),
    private: privateCapture,
  };
}

export function reviewerDescription(anchor: PrototypeAnchor): string {
  const role = anchor.accessibleRole ?? "item";
  if (anchor.private) {
    return `Private ${role}`;
  }
  if (anchor.accessibleName) {
    return `${role}: ${anchor.accessibleName}`;
  }
  return `${role} on this page`;
}
