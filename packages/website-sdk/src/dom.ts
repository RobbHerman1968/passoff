import { HOST_ROOT_ID } from "./styles";

export const SDK_HOST_SELECTOR = `#${HOST_ROOT_ID}`;

export function prefersReducedMotion(): boolean {
  return Boolean(
    window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches,
  );
}

export function isSdkHost(node: Node | null): boolean {
  if (!node) {
    return false;
  }
  if (node instanceof Element) {
    if (node.id === HOST_ROOT_ID || node.closest(SDK_HOST_SELECTOR)) {
      return true;
    }
  }
  const root = node.getRootNode();
  if (root instanceof ShadowRoot && root.host.id === HOST_ROOT_ID) {
    return true;
  }
  return false;
}

export function eventTouchesSdk(event: Event): boolean {
  const path = event.composedPath();
  return path.some((entry) => entry instanceof Node && isSdkHost(entry));
}

export function isVisible(element: Element): boolean {
  if (!(element instanceof HTMLElement)) {
    return false;
  }
  if (element.hidden) {
    return false;
  }
  const style = window.getComputedStyle(element);
  if (style.display === "none" || style.visibility === "hidden") {
    return false;
  }
  const rect = element.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

export function getAccessibleName(element: Element): string | null {
  if (element instanceof HTMLElement) {
    const labelledBy = element.getAttribute("aria-labelledby");
    if (labelledBy) {
      const names = labelledBy
        .split(/\s+/)
        .map((id) => document.getElementById(id)?.textContent?.trim())
        .filter(Boolean);
      if (names.length) {
        return names.join(" ");
      }
    }
    const ariaLabel = element.getAttribute("aria-label")?.trim();
    if (ariaLabel) {
      return ariaLabel;
    }
  }
  if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
    if (element.labels?.length) {
      return Array.from(element.labels)
        .map((label) => label.textContent?.trim())
        .filter(Boolean)
        .join(" ");
    }
    return element.placeholder || element.name || null;
  }
  if (element instanceof HTMLImageElement) {
    return element.alt || null;
  }
  const text = element.textContent?.replace(/\s+/g, " ").trim();
  return text ? text.slice(0, 80) : null;
}

export function getAccessibleRole(element: Element): string | null {
  const explicit = element.getAttribute("role");
  if (explicit) {
    return explicit;
  }
  const tag = element.tagName.toLowerCase();
  const roles: Record<string, string> = {
    a: "link",
    button: "button",
    input: "textbox",
    select: "combobox",
    textarea: "textbox",
    img: "img",
    h1: "heading",
    h2: "heading",
    h3: "heading",
    nav: "navigation",
    main: "main",
  };
  if (element instanceof HTMLInputElement) {
    if (element.type === "button" || element.type === "submit") {
      return "button";
    }
    if (element.type === "checkbox") {
      return "checkbox";
    }
    if (element.type === "radio") {
      return "radio";
    }
    if (element.type === "password") {
      return "textbox";
    }
  }
  return roles[tag] ?? null;
}

export function cssSelectorFor(element: Element): string {
  if (element.id && /^[A-Za-z][\w-]*$/.test(element.id)) {
    return `#${element.id}`;
  }
  const parts: string[] = [];
  let current: Element | null = element;
  let depth = 0;
  while (current && depth < 6 && current !== document.body) {
    const tag = current.tagName.toLowerCase();
    const parentNode: Element | null = current.parentElement;
    if (!parentNode) {
      parts.unshift(tag);
      break;
    }
    const sameTag = Array.from(parentNode.children).filter(
      (child: Element) => child.tagName === current!.tagName,
    );
    const index = sameTag.indexOf(current) + 1;
    parts.unshift(`${tag}:nth-of-type(${index})`);
    current = parentNode;
    depth += 1;
  }
  return parts.join(" > ");
}

export function ancestryFingerprint(element: Element, depth = 8): string {
  const parts: string[] = [];
  let current: Element | null = element;
  let level = 0;
  while (current && level < depth) {
    const parentNode: Element | null = current.parentElement;
    const index = parentNode
      ? Array.prototype.indexOf.call(parentNode.children, current)
      : 0;
    const classHint = current.classList.item(0) ?? "-";
    parts.push(
      `${current.tagName.toLowerCase()}:${current.id || "-"}:${classHint}:${index}`,
    );
    current = parentNode;
    level += 1;
  }
  return parts.join("/");
}

export function clamp01(value: number): number {
  if (Number.isNaN(value) || !Number.isFinite(value)) {
    return 0;
  }
  return Math.min(1, Math.max(0, value));
}

export function describeEnvironment(): { browser: string; operatingSystem: string } {
  const ua = navigator.userAgent;
  let browser = "Unknown browser";
  if (ua.includes("Edg/")) {
    browser = "Edge";
  } else if (ua.includes("Chrome/")) {
    browser = "Chrome";
  } else if (ua.includes("Firefox/")) {
    browser = "Firefox";
  } else if (ua.includes("Safari/") && !ua.includes("Chrome/")) {
    browser = "Safari";
  }

  let operatingSystem = "Unknown OS";
  if (ua.includes("Mac OS X") || ua.includes("Macintosh")) {
    operatingSystem = "macOS";
  } else if (ua.includes("Windows")) {
    operatingSystem = "Windows";
  } else if (ua.includes("Android")) {
    operatingSystem = "Android";
  } else if (ua.includes("Linux")) {
    operatingSystem = "Linux";
  } else if (ua.includes("iPhone") || ua.includes("iPad")) {
    operatingSystem = "iOS";
  }

  return { browser, operatingSystem };
}

export function routeFromUrl(url: string): string {
  try {
    const parsed = new URL(url, window.location.origin);
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return "/";
  }
}

/** Normalize a page URL the same way the server does (no hash). */
export function normalizePageUrlClient(url: string): string | null {
  try {
    const parsed = new URL(url, window.location.origin);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return null;
  }
}
