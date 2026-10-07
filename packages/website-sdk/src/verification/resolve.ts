import { ANCHOR_DATA_ATTRIBUTES } from "../types";
import { isSdkHost } from "../dom";

export type AnchorPayload = {
  stableElementId: string | null;
  approvedDataAttributes: Record<string, string>;
  cssSelector: string | null;
  ancestryFingerprint: string | null;
};

export type ResolveResult =
  | { status: "exact" | "likely"; element: Element; matchCount: 1 }
  | { status: "ambiguous"; element: null; matchCount: number }
  | { status: "missing"; element: null; matchCount: 0 }
  | { status: "cross_origin"; element: null; matchCount: 0 };

function cssEscape(value: string): string {
  if (typeof CSS !== "undefined" && typeof CSS.escape === "function") {
    return CSS.escape(value);
  }
  return value.replace(/["\\]/g, "\\$&");
}

function uniqueQuery(selector: string, root: ParentNode): Element[] {
  try {
    return [...root.querySelectorAll(selector)].filter((node) => !isSdkHost(node));
  } catch {
    return [];
  }
}

function queryRoots(): ParentNode[] {
  const roots: ParentNode[] = [document];
  for (const frame of Array.from(document.querySelectorAll("iframe"))) {
    try {
      const doc = frame.contentDocument;
      if (doc) roots.push(doc);
    } catch {
      return [];
    }
  }
  return roots;
}

export function resolveAnchor(anchor: AnchorPayload): ResolveResult {
  const roots = queryRoots();
  if (roots.length === 0) {
    return { status: "cross_origin", element: null, matchCount: 0 };
  }

  const matches: Element[] = [];

  if (anchor.stableElementId) {
    for (const root of roots) {
      const found =
        root instanceof Document
          ? root.getElementById(anchor.stableElementId)
          : uniqueQuery(`#${cssEscape(anchor.stableElementId)}`, root)[0];
      if (found && !isSdkHost(found)) matches.push(found);
    }
    if (matches.length === 1) {
      return { status: "exact", element: matches[0], matchCount: 1 };
    }
    if (matches.length > 1) {
      return { status: "ambiguous", element: null, matchCount: matches.length };
    }
  }

  for (const [attr, value] of Object.entries(anchor.approvedDataAttributes ?? {})) {
    if (!ANCHOR_DATA_ATTRIBUTES.includes(attr as (typeof ANCHOR_DATA_ATTRIBUTES)[number])) {
      continue;
    }
    const found: Element[] = [];
    for (const root of roots) {
      found.push(...uniqueQuery(`[${cssEscape(attr)}="${cssEscape(value)}"]`, root));
    }
    if (found.length === 1) {
      return { status: "exact", element: found[0], matchCount: 1 };
    }
    if (found.length > 1) {
      return { status: "ambiguous", element: null, matchCount: found.length };
    }
  }

  if (anchor.cssSelector) {
    const found: Element[] = [];
    for (const root of roots) {
      found.push(...uniqueQuery(anchor.cssSelector, root));
    }
    if (found.length > 1) {
      return { status: "ambiguous", element: null, matchCount: found.length };
    }
    if (found.length === 1) {
      const fingerprintOk =
        !anchor.ancestryFingerprint ||
        ancestryFingerprint(found[0]) === anchor.ancestryFingerprint;
      return fingerprintOk
        ? { status: "likely", element: found[0], matchCount: 1 }
        : { status: "missing", element: null, matchCount: 0 };
    }
  }

  return { status: "missing", element: null, matchCount: 0 };
}

function ancestryFingerprint(element: Element): string {
  const parts: string[] = [];
  let current: Element | null = element;
  while (current && parts.length < 8) {
    parts.push(current.tagName.toLowerCase());
    current = current.parentElement;
  }
  return parts.join(">");
}
