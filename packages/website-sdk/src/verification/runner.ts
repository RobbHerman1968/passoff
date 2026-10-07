import { SCREENSHOT_CHUNK_FILE } from "../build-flags";
import { HOST_ROOT_ID, REVIEW_STYLES, VERSION } from "../styles";
import { createIdempotencyKey } from "../session-store";
import type { VerificationBootstrap } from "./api";
import {
  submitVerificationEvidence,
  submitVerificationResults,
} from "./api";
import { ANCHOR_CONFIDENCE_OK } from "./contract";
import { runNamedHook } from "./hooks";
import { evaluateOverlap } from "./overlap";
import { resolveAnchor } from "./resolve";
import { documentLooksReady, isLayoutStable } from "./stability";
import { captureViewport } from "./viewport";
import { evaluateVisibility } from "./visibility";

export type VerificationRuntime = {
  destroy: () => void;
};

const TOOLBAR_POSITION_KEY = "passoff.sdk.verification-panel-position.v1";
const TOOLBAR_EDGE_GAP = 8;

type ToolbarPosition = { left: number; top: number };

function readPosition(): ToolbarPosition | null {
  try {
    const stored = JSON.parse(
      window.sessionStorage.getItem(TOOLBAR_POSITION_KEY) ?? "null",
    ) as Partial<ToolbarPosition> | null;
    if (!stored || !Number.isFinite(stored.left) || !Number.isFinite(stored.top)) {
      return null;
    }
    return { left: Number(stored.left), top: Number(stored.top) };
  } catch {
    return null;
  }
}

function writePosition(position: ToolbarPosition | null): void {
  try {
    if (position) {
      window.sessionStorage.setItem(TOOLBAR_POSITION_KEY, JSON.stringify(position));
    } else {
      window.sessionStorage.removeItem(TOOLBAR_POSITION_KEY);
    }
  } catch {
    // ignore
  }
}

export function mountVerification(options: {
  apiBaseUrl: string;
  assetBaseUrl: string;
  sessionToken: string;
  bootstrap: VerificationBootstrap;
  buildId?: string | null;
}): VerificationRuntime {
  const host = document.createElement("div");
  host.id = HOST_ROOT_ID;
  host.setAttribute("data-passoff-ui", "true");
  host.style.cssText =
    "position:fixed;inset:0;pointer-events:none;z-index:2147483000;contain:layout style;";
  const shadow = host.attachShadow({ mode: "open" });
  const style = document.createElement("style");
  style.textContent = `${REVIEW_STYLES}
.v-panel { max-width: min(22rem, calc(100vw - 16px)); padding: 12px; }
.v-list { margin: 8px 0 0; padding: 0; list-style: none; display: grid; gap: 6px; }
.v-list li { font-size: 13px; }
.progress { height: 6px; background: var(--subtle); border-radius: 99px; overflow: hidden; margin-top: 8px; }
.progress > span { display: block; height: 100%; background: var(--primary); width: var(--p, 0%); }
`;
  const root = document.createElement("div");
  root.className = "passoff-root";
  shadow.append(style, root);
  document.documentElement.append(host);

  const live = document.createElement("div");
  live.className = "visually-hidden";
  live.setAttribute("aria-live", "polite");
  live.setAttribute("role", "status");

  const toolbar = document.createElement("div");
  toolbar.className = "toolbar v-panel";
  toolbar.setAttribute("role", "region");
  toolbar.setAttribute("aria-label", "Passoff verification checks");

  const moveInstructions = document.createElement("span");
  moveInstructions.className = "visually-hidden";
  moveInstructions.id = "passoff-v-move";
  moveInstructions.textContent =
    "Drag to move this panel. Arrow keys also move it. Home returns it to the default location.";

  const moveButton = document.createElement("button");
  moveButton.className = "button move-handle";
  moveButton.type = "button";
  moveButton.setAttribute("aria-label", "Move verification panel");
  moveButton.setAttribute("aria-describedby", moveInstructions.id);
  moveButton.textContent = "⋮⋮";

  const heading = document.createElement("h2");
  heading.className = "brand";
  heading.textContent = `Issue #${options.bootstrap.issueNumber}`;

  const title = document.createElement("p");
  title.className = "mode-label";
  title.textContent = options.bootstrap.issueTitle;

  const meta = document.createElement("p");
  meta.className = "status";

  const list = document.createElement("ul");
  list.className = "v-list";

  const progress = document.createElement("div");
  progress.className = "progress";
  progress.setAttribute("role", "progressbar");
  progress.setAttribute("aria-valuemin", "0");
  progress.setAttribute("aria-valuemax", "100");
  progress.setAttribute("aria-valuenow", "0");
  progress.setAttribute("aria-label", "Check progress");
  const bar = document.createElement("span");
  progress.append(bar);

  const cancel = document.createElement("button");
  cancel.className = "button";
  cancel.type = "button";
  cancel.textContent = "Cancel";

  const ret = document.createElement("a");
  ret.className = "button";
  ret.hidden = true;
  ret.textContent = "Return to issue";
  ret.href = "#";

  toolbar.append(
    moveInstructions,
    moveButton,
    heading,
    title,
    meta,
    list,
    progress,
    cancel,
    ret,
  );
  root.append(live, toolbar);

  let cancelled = false;
  let destroyed = false;
  let toolbarPosition = readPosition();
  const idempotencyKey = createIdempotencyKey();

  const applyPosition = (position: ToolbarPosition, persist = true) => {
    const rect = toolbar.getBoundingClientRect();
    const maxLeft = Math.max(TOOLBAR_EDGE_GAP, window.innerWidth - rect.width - TOOLBAR_EDGE_GAP);
    const maxTop = Math.max(TOOLBAR_EDGE_GAP, window.innerHeight - rect.height - TOOLBAR_EDGE_GAP);
    toolbarPosition = {
      left: Math.min(Math.max(position.left, TOOLBAR_EDGE_GAP), maxLeft),
      top: Math.min(Math.max(position.top, TOOLBAR_EDGE_GAP), maxTop),
    };
    toolbar.dataset.placement = "custom";
    toolbar.style.left = `${toolbarPosition.left}px`;
    toolbar.style.top = `${toolbarPosition.top}px`;
    toolbar.style.right = "auto";
    toolbar.style.bottom = "auto";
    if (persist) writePosition(toolbarPosition);
  };

  const resetPosition = () => {
    toolbarPosition = null;
    writePosition(null);
    toolbar.style.removeProperty("left");
    toolbar.style.removeProperty("top");
    toolbar.dataset.placement = window.innerWidth < 768 ? "mobile" : "desktop";
  };

  const positionChrome = () => {
    if (toolbarPosition) applyPosition(toolbarPosition);
    else toolbar.dataset.placement = window.innerWidth < 768 ? "mobile" : "desktop";
  };
  positionChrome();
  window.addEventListener("resize", positionChrome);

  let drag:
    | { pointerId: number; startX: number; startY: number; startLeft: number; startTop: number }
    | undefined;
  const startDrag = (event: PointerEvent) => {
    if (event.button !== 0) return;
    const rect = toolbar.getBoundingClientRect();
    drag = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startLeft: rect.left,
      startTop: rect.top,
    };
    toolbar.dataset.dragging = "true";
    event.preventDefault();
  };
  const moveDrag = (event: PointerEvent) => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    applyPosition(
      {
        left: drag.startLeft + event.clientX - drag.startX,
        top: drag.startTop + event.clientY - drag.startY,
      },
      false,
    );
  };
  const endDrag = (event: PointerEvent) => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    drag = undefined;
    delete toolbar.dataset.dragging;
    if (toolbarPosition) writePosition(toolbarPosition);
  };
  moveButton.addEventListener("pointerdown", startDrag);
  window.addEventListener("pointermove", moveDrag);
  window.addEventListener("pointerup", endDrag);
  window.addEventListener("pointercancel", endDrag);
  moveButton.addEventListener("keydown", (event) => {
    if (event.key === "Home") {
      event.preventDefault();
      resetPosition();
      return;
    }
    const movement = {
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
      ArrowUp: [0, -1],
      ArrowDown: [0, 1],
    }[event.key];
    if (!movement) return;
    event.preventDefault();
    const rect = toolbar.getBoundingClientRect();
    applyPosition({
      left: rect.left + movement[0] * 12,
      top: rect.top + movement[1] * 12,
    });
  });

  const setState = (label: string, percent: number) => {
    const viewport = captureViewport();
    meta.textContent = `${options.bootstrap.environmentName} · ${options.bootstrap.expectedVersion} · ${options.bootstrap.pageRoute ?? window.location.pathname} · ${viewport.width} × ${viewport.height}`;
    live.textContent = label;
    bar.style.setProperty("--p", `${percent}%`);
    progress.setAttribute("aria-valuenow", String(percent));
  };

  const addCheckRow = (label: string, result: string) => {
    const item = document.createElement("li");
    item.textContent = `${label}: ${result}`;
    list.append(item);
  };

  const avoidCovering = (element: Element | null) => {
    if (!element) return;
    const target = element.getBoundingClientRect();
    const panel = toolbar.getBoundingClientRect();
    const overlaps =
      panel.left < target.right &&
      panel.right > target.left &&
      panel.top < target.bottom &&
      panel.bottom > target.top;
    if (!overlaps) return;
    applyPosition({ left: TOOLBAR_EDGE_GAP, top: TOOLBAR_EDGE_GAP });
  };

  const finish = async (body: Record<string, unknown>) => {
    cancel.hidden = true;
    ret.hidden = false;
    const origin = options.bootstrap.siteOrigin?.replace(/\/$/, "");
    ret.href = origin
      ? `${origin}${options.bootstrap.returnPath}`
      : options.bootstrap.returnPath;
    await submitVerificationResults({
      apiBaseUrl: options.apiBaseUrl,
      sessionToken: options.sessionToken,
      idempotencyKey,
      body,
    });
  };

  const onCancel = () => {
    cancelled = true;
    setState("Cancelled", 100);
    addCheckRow("Session", "Cancelled");
    void finish({
      cancelled: true,
      failureCode: "cancelled",
      actualUrl: window.location.href,
      actualRoute: window.location.pathname,
      viewport: captureViewport(),
      runnerVersion: VERSION,
    });
  };
  cancel.addEventListener("click", onCancel);
  const onEscape = (event: KeyboardEvent) => {
    if (event.key === "Escape" && !cancelled) {
      event.stopPropagation();
      onCancel();
    }
  };
  window.addEventListener("keydown", onEscape);

  void (async () => {
    setState("Preparing", 10);
    if (!documentLooksReady()) {
      await finish({
        failureCode: "page_loading",
        documentReady: false,
        actualUrl: window.location.href,
        actualRoute: window.location.pathname,
        viewport: captureViewport(),
        runnerVersion: VERSION,
      });
      setState("Needs attention", 100);
      addCheckRow("Page", "Still loading");
      return;
    }

    setState("Locating the issue", 25);
    const marker = options.bootstrap.marker;
    if (!marker) {
      await finish({
        failureCode: "anchor_missing",
        actualUrl: window.location.href,
        viewport: captureViewport(),
        runnerVersion: VERSION,
        version: {
          method: options.buildId ? "application_release" : "missing",
          value: options.buildId ?? "",
        },
      });
      setState("Needs attention", 100);
      addCheckRow("Element", "Not linked");
      return;
    }
    if (!ANCHOR_CONFIDENCE_OK.has(marker.matchConfidence) && marker.matchConfidence !== "unchecked") {
      const resolvedEarly = resolveAnchor(marker);
      if (resolvedEarly.status !== "exact" && resolvedEarly.status !== "likely") {
        const code =
          resolvedEarly.status === "cross_origin"
            ? "cross_origin_frame"
            : resolvedEarly.status === "ambiguous"
              ? "anchor_ambiguous"
              : "anchor_missing";
        await finish({
          failureCode: code,
          anchorConfidence: resolvedEarly.status,
          actualUrl: window.location.href,
          viewport: captureViewport(),
          runnerVersion: VERSION,
          version: {
            method: options.buildId ? "application_release" : "missing",
            value: options.buildId ?? "",
          },
        });
        setState("Needs attention", 100);
        addCheckRow("Element", resolvedEarly.status === "ambiguous" ? "Ambiguous" : "Not found");
        return;
      }
    }

    const resolved = resolveAnchor(marker);
    if (resolved.status === "cross_origin" || resolved.status === "ambiguous" || resolved.status === "missing") {
      const code =
        resolved.status === "cross_origin"
          ? "cross_origin_frame"
          : resolved.status === "ambiguous"
            ? "anchor_ambiguous"
            : "anchor_missing";
      await finish({
        failureCode: code,
        anchorConfidence: resolved.status,
        actualUrl: window.location.href,
        viewport: captureViewport(),
        runnerVersion: VERSION,
        version: {
          method: options.buildId ? "application_release" : "missing",
          value: options.buildId ?? "",
        },
      });
      setState("Needs attention", 100);
      addCheckRow("Element", code === "anchor_ambiguous" ? "Ambiguous" : "Not found");
      return;
    }

    avoidCovering(resolved.element);
    if (!(await isLayoutStable(resolved.element))) {
      await finish({
        failureCode: "layout_changing",
        layoutStable: false,
        actualUrl: window.location.href,
        viewport: captureViewport(),
        runnerVersion: VERSION,
        version: {
          method: options.buildId ? "application_release" : "missing",
          value: options.buildId ?? "",
        },
      });
      setState("Needs attention", 100);
      addCheckRow("Layout", "Still changing");
      return;
    }

    if (cancelled) return;
    setState("Running checks", 55);
    const checks: Array<Record<string, unknown>> = [];
    const selected = options.bootstrap.selectedChecks;

    if (selected.includes("element_visibility")) {
      const visibility = evaluateVisibility(resolved.element);
      checks.push({
        kind: "element_visibility",
        outcome: visibility.outcome,
        summary:
          visibility.outcome === "passed"
            ? "The expected element is on the page and visible."
            : visibility.outcome === "failed"
              ? "The expected element is on the page but is not visible."
              : "Passoff could not tell whether the element is visible.",
        measurements: visibility.measurements,
        limitations: visibility.limitations,
      });
      addCheckRow(
        "Element visibility",
        visibility.outcome === "passed" ? "Passed" : visibility.outcome === "failed" ? "Failed" : "Uncertain",
      );
    }

    if (cancelled) return;
    if (selected.includes("bounding_box_overlap")) {
      const overlap = evaluateOverlap(resolved.element);
      checks.push({
        kind: "bounding_box_overlap",
        outcome: overlap.outcome,
        summary:
          overlap.outcome === "passed"
            ? "The expected element is not covered."
            : overlap.outcome === "failed"
              ? `The expected element is covered by a ${overlap.measurements.coverPlacement} page region.`
              : "Passoff could not tell whether the element is covered.",
        measurements: overlap.measurements,
        limitations: overlap.limitations,
      });
      addCheckRow(
        "Overlap",
        overlap.outcome === "passed" ? "Passed" : overlap.outcome === "failed" ? "Failed" : "Uncertain",
      );
    }

    if (cancelled) return;
    if (selected.includes("named_test_hook") && options.bootstrap.namedHook) {
      const hook = await runNamedHook(
        options.bootstrap.namedHook,
        options.bootstrap.hookAllowlist,
      );
      checks.push({
        kind: "named_test_hook",
        outcome: hook.outcome,
        summary: hook.summary,
        measurements: hook.measurements,
        limitations: hook.limitations,
        hookName: options.bootstrap.namedHook,
      });
      addCheckRow("Named check", hook.outcome === "passed" ? "Passed" : hook.outcome === "failed" ? "Failed" : "Uncertain");
    }

    setState("Capturing evidence", 80);
    let evidenceFailed = false;
    try {
      let screenshotModule: {
        attemptScreenshot: (input: { element: Element }) => Promise<{
          status: string;
          reason: string;
          dataUrl?: string;
          annotation?: unknown;
        }>;
      } | null = null;
      const loader = (
        window as Window & {
          __PASSOFF_SCREENSHOT_LOADER__?: (base: string) => Promise<{
            attemptScreenshot: (input: { element: Element }) => Promise<{
              status: string;
              reason: string;
              dataUrl?: string;
              annotation?: unknown;
            }>;
          }>;
        }
      ).__PASSOFF_SCREENSHOT_LOADER__;
      if (loader) {
        screenshotModule = await loader(options.assetBaseUrl);
      } else {
        const url = new URL(SCREENSHOT_CHUNK_FILE, options.assetBaseUrl);
        url.searchParams.set("v", VERSION);
        screenshotModule = (await import(/* @vite-ignore */ url.href)) as typeof screenshotModule;
      }
      if (screenshotModule) {
        const shot = await screenshotModule.attemptScreenshot({ element: resolved.element });
        const uploaded = await submitVerificationEvidence({
          apiBaseUrl: options.apiBaseUrl,
          sessionToken: options.sessionToken,
          body: {
            status: shot.status === "unavailable" ? "failed" : "ready",
            dataUrl: shot.dataUrl,
            annotation: shot.annotation,
            reason: shot.reason,
          },
        });
        evidenceFailed = !uploaded || shot.status === "unavailable";
      }
    } catch {
      evidenceFailed = true;
    }

    if (cancelled) return;
    setState("Complete", 100);
    await finish({
      checks,
      evidenceFailed,
      actualUrl: window.location.href,
      actualRoute: window.location.pathname,
      viewport: captureViewport(),
      runnerVersion: VERSION,
      layoutStable: true,
      documentReady: true,
      version: {
        method: options.buildId ? "application_release" : "missing",
        value: options.buildId ?? "",
      },
      anchorConfidence: resolved.status,
    });
  })();

  return {
    destroy() {
      destroyed = true;
      cancelled = true;
      window.removeEventListener("resize", positionChrome);
      window.removeEventListener("pointermove", moveDrag);
      window.removeEventListener("pointerup", endDrag);
      window.removeEventListener("pointercancel", endDrag);
      window.removeEventListener("keydown", onEscape);
      moveButton.removeEventListener("pointerdown", startDrag);
      host.remove();
      void destroyed;
    },
  };
}
