import { reviewerDescription } from "./anchor";
import { safeListener } from "./safe";
import type { SdkRemoteIssue } from "./api";
import type { PrototypeAnchor } from "./types";

export type MarkerRecord = {
  number: number;
  issueId?: string;
  statusLabel?: string;
  summary?: string;
  element: Element | null;
  anchor: PrototypeAnchor | null;
  remote?: SdkRemoteIssue;
  missing: boolean;
};

export type MarkerLayer = {
  add: (element: Element, anchor: PrototypeAnchor, meta?: {
    number?: number;
    issueId?: string;
    statusLabel?: string;
    summary?: string;
  }) => MarkerRecord;
  replaceWithRemote: (issues: SdkRemoteIssue[]) => void;
  records: () => MarkerRecord[];
  refresh: () => void;
  start: () => void;
  stop: () => void;
};

function cssEscape(value: string): string {
  if (typeof CSS !== "undefined" && typeof CSS.escape === "function") {
    return CSS.escape(value);
  }
  return value.replace(/["\\]/g, "\\$&");
}

function findElementForRemote(issue: SdkRemoteIssue): Element | null {
  const marker = issue.marker;
  if (marker.stableElementId) {
    const byId = document.getElementById(marker.stableElementId);
    if (byId) return byId;
  }
  for (const [attr, value] of Object.entries(marker.approvedDataAttributes ?? {})) {
    try {
      const found = document.querySelector(
        `[${cssEscape(attr)}="${cssEscape(value)}"]`,
      );
      if (found) return found;
    } catch {
      // ignore bad attribute selectors
    }
  }
  if (marker.cssSelector) {
    try {
      const found = document.querySelector(marker.cssSelector);
      if (found) return found;
    } catch {
      // ignore
    }
  }
  return null;
}

function accessibleLabel(record: MarkerRecord): string {
  const status = record.statusLabel ? `, ${record.statusLabel}` : "";
  const place = record.anchor
    ? reviewerDescription(record.anchor)
    : record.summary
      ? record.summary
      : "saved feedback";
  if (record.missing) {
    return `Issue ${record.number}${status}. Original element not found.`;
  }
  return `Issue ${record.number}${status}. ${place}`;
}

export function createMarkerLayer(options: {
  overlay: HTMLElement;
  onSelect: (marker: MarkerRecord) => void;
  onMissing: (marker: MarkerRecord) => void;
}): MarkerLayer {
  const records: MarkerRecord[] = [];
  const nodes = new Map<number, HTMLButtonElement>();
  let frame = 0;
  let observer: MutationObserver | null = null;
  let resizeObserver: ResizeObserver | null = null;

  const clearNodes = () => {
    nodes.forEach((node) => node.remove());
    nodes.clear();
    records.length = 0;
  };

  const ensureButton = (record: MarkerRecord) => {
    let button = nodes.get(record.number);
    if (!button) {
      button = document.createElement("button");
      button.type = "button";
      button.className = "marker";
      const number = document.createElement("span");
      number.className = "marker-number";
      button.append(number);
      button.addEventListener("click", () => options.onSelect(record));
      options.overlay.append(button);
      nodes.set(record.number, button);
    }
    const number = button.querySelector(".marker-number");
    if (number) {
      number.textContent = String(record.number);
    }
    button.dataset.status = record.statusLabel ?? "Open";
    button.setAttribute("aria-label", accessibleLabel(record));
    if (record.missing) {
      button.dataset.missing = "true";
    } else {
      delete button.dataset.missing;
    }
    return button;
  };

  const positionNode = (record: MarkerRecord) => {
    const button = ensureButton(record);
    if (!record.element || !record.element.isConnected) {
      if (!record.missing) {
        record.missing = true;
        button.dataset.missing = "true";
        button.setAttribute("aria-label", accessibleLabel(record));
        options.onMissing(record);
      }
      if (record.anchor?.documentPosition) {
        button.style.left = `${record.anchor.documentPosition.x}px`;
        button.style.top = `${record.anchor.documentPosition.y - window.scrollY}px`;
      } else if (record.remote?.marker.documentX != null) {
        button.style.left = `${record.remote.marker.documentX}px`;
        button.style.top = `${(record.remote.marker.documentY ?? 0) - window.scrollY}px`;
      }
      return;
    }
    record.missing = false;
    delete button.dataset.missing;
    const rect = record.element.getBoundingClientRect();
    const nx =
      record.anchor?.normalizedPosition.x ??
      record.remote?.marker.normalizedX ??
      0.5;
    const ny =
      record.anchor?.normalizedPosition.y ??
      record.remote?.marker.normalizedY ??
      0.5;
    button.style.left = `${rect.left + rect.width * nx}px`;
    button.style.top = `${rect.top + rect.height * ny}px`;
    button.setAttribute("aria-label", accessibleLabel(record));
    resizeObserver?.observe(record.element);
  };

  const schedule = () => {
    if (frame) {
      return;
    }
    frame = window.requestAnimationFrame(() => {
      frame = 0;
      records.forEach(positionNode);
    });
  };

  const onScroll = safeListener(() => schedule());
  const onResize = safeListener(() => schedule());

  return {
    add(element, anchor, meta) {
      const number = meta?.number ?? records.length + 1;
      const record: MarkerRecord = {
        number,
        issueId: meta?.issueId,
        statusLabel: meta?.statusLabel ?? "Open",
        summary: meta?.summary,
        element,
        anchor,
        missing: false,
      };
      records.push(record);
      positionNode(record);
      return record;
    },
    replaceWithRemote(issues) {
      clearNodes();
      for (const issue of issues) {
        const element = findElementForRemote(issue);
        const record: MarkerRecord = {
          number: issue.number,
          issueId: issue.id,
          statusLabel: issue.statusLabel,
          summary: issue.summary,
          element,
          anchor: null,
          remote: issue,
          missing: !element,
        };
        records.push(record);
        positionNode(record);
      }
    },
    records: () => records,
    refresh() {
      records.forEach((record) => {
        if (record.remote && (!record.element || !record.element.isConnected)) {
          record.element = findElementForRemote(record.remote);
        }
        positionNode(record);
      });
    },
    start() {
      observer = new MutationObserver(() => schedule());
      observer.observe(document.documentElement, {
        childList: true,
        subtree: true,
        attributes: false,
      });
      resizeObserver = new ResizeObserver(() => schedule());
      window.addEventListener("scroll", onScroll, true);
      window.addEventListener("resize", onResize);
      window.visualViewport?.addEventListener("resize", onResize);
    },
    stop() {
      observer?.disconnect();
      observer = null;
      resizeObserver?.disconnect();
      resizeObserver = null;
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onResize);
      window.visualViewport?.removeEventListener("resize", onResize);
      if (frame) {
        window.cancelAnimationFrame(frame);
        frame = 0;
      }
      clearNodes();
    },
  };
}
