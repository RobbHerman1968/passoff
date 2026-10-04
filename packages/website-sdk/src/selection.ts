import { eventTouchesSdk, getAccessibleName, getAccessibleRole, isSdkHost, isVisible } from "./dom";
import { safeListener } from "./safe";

const SELECTABLE_SELECTOR = [
  "a[href]",
  "button",
  "input",
  "select",
  "textarea",
  "summary",
  "[role='button']",
  "[role='link']",
  "h1",
  "h2",
  "h3",
  "p",
  "img",
  "li",
  "label",
  "article",
  "section",
  "[data-passoff-anchor]",
].join(",");

export type SelectionChange = {
  element: Element | null;
  announcement: string;
};

export type SelectionController = {
  start: (mode: "pointer" | "keyboard") => void;
  stop: () => void;
  isActive: () => boolean;
  current: () => Element | null;
};

function candidates(): Element[] {
  return Array.from(document.querySelectorAll(SELECTABLE_SELECTOR)).filter((element) => {
    if (isSdkHost(element) || element.closest("[data-passoff-harness]")) {
      return false;
    }
    if (element.closest("script, style, noscript")) {
      return false;
    }
    return isVisible(element);
  });
}

export function announceCandidate(element: Element): string {
  const role = getAccessibleRole(element) ?? element.tagName.toLowerCase();
  const name = getAccessibleName(element);
  if (name) {
    return `Selected ${role}: ${name}`;
  }
  return `Selected ${role}`;
}

export function createSelectionController(options: {
  onChange: (change: SelectionChange) => void;
  onConfirm: (element: Element, point: { x: number; y: number }) => void;
  onCancel: () => void;
}): SelectionController {
  let active = false;
  let entry: "pointer" | "keyboard" = "pointer";
  let current: Element | null = null;
  let keyboardIndex = -1;

  const pickFromPoint = (x: number, y: number): Element | null => {
    const stack = document.elementsFromPoint(x, y);
    for (const node of stack) {
      if (!(node instanceof Element) || isSdkHost(node)) {
        continue;
      }
      const match = node.closest(SELECTABLE_SELECTOR);
      if (match && !isSdkHost(match) && !match.closest("[data-passoff-harness]")) {
        return match;
      }
      if (!isSdkHost(node) && node !== document.documentElement && node !== document.body) {
        return node;
      }
    }
    return null;
  };

  const setCurrent = (element: Element | null) => {
    current = element;
    options.onChange({
      element,
      announcement: element ? announceCandidate(element) : "No page element is highlighted.",
    });
  };

  const onPointerMove = safeListener((event: PointerEvent) => {
    if (!active || entry === "keyboard") {
      return;
    }
    if (eventTouchesSdk(event)) {
      return;
    }
    setCurrent(pickFromPoint(event.clientX, event.clientY));
  });

  const onPointerDown = safeListener((event: PointerEvent) => {
    if (!active) {
      return;
    }
    if (eventTouchesSdk(event)) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    const element = pickFromPoint(event.clientX, event.clientY);
    if (element) {
      options.onConfirm(element, { x: event.clientX, y: event.clientY });
    }
  });

  const onClick = safeListener((event: MouseEvent) => {
    if (!active || eventTouchesSdk(event)) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
  });

  const onKeyDown = safeListener((event: KeyboardEvent) => {
    if (!active) {
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      options.onCancel();
      return;
    }
    if (entry !== "keyboard") {
      return;
    }
    const list = candidates();
    if (event.key === "Tab" || event.key === "ArrowRight" || event.key === "ArrowDown") {
      event.preventDefault();
      keyboardIndex = Math.min(list.length - 1, keyboardIndex + 1);
      setCurrent(list[keyboardIndex] ?? null);
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      event.preventDefault();
      keyboardIndex = Math.max(0, keyboardIndex - 1);
      setCurrent(list[keyboardIndex] ?? null);
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (current) {
        const rect = current.getBoundingClientRect();
        options.onConfirm(current, {
          x: rect.left + rect.width / 2,
          y: rect.top + rect.height / 2,
        });
      }
    }
  });

  return {
    start(mode) {
      if (active) {
        return;
      }
      active = true;
      entry = mode;
      keyboardIndex = -1;
      document.addEventListener("pointermove", onPointerMove, true);
      document.addEventListener("pointerdown", onPointerDown, true);
      document.addEventListener("click", onClick, true);
      document.addEventListener("keydown", onKeyDown, true);
      if (mode === "keyboard") {
        const list = candidates();
        keyboardIndex = 0;
        setCurrent(list[0] ?? null);
      }
    },
    stop() {
      if (!active) {
        return;
      }
      active = false;
      current = null;
      document.removeEventListener("pointermove", onPointerMove, true);
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("keydown", onKeyDown, true);
    },
    isActive: () => active,
    current: () => current,
  };
}
