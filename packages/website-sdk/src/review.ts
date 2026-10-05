import { captureAnchor, reviewerDescription } from "./anchor";
import { createIssue, fetchIssues, type SdkRemoteIssue } from "./api";
import { SCREENSHOT_CHUNK_FILE } from "./build-flags";
import { createMarkerLayer, type MarkerRecord } from "./markers";
import { createIdempotencyKey } from "./session-store";
import { createSelectionController } from "./selection";
import { HOST_ROOT_ID, REVIEW_STYLES, VERSION } from "./styles";
import { normalizePageUrlClient } from "./dom";
import type {
  PrototypeAnchor,
  ReviewerConfirmation,
  ReviewMode,
  ScreenshotResult,
} from "./types";

export type ReviewRuntime = {
  root: HTMLElement;
  shadow: ShadowRoot;
  setMode: (mode: ReviewMode) => void;
  getMode: () => ReviewMode;
  setCollapsed: (collapsed: boolean) => void;
  getCollapsed: () => boolean;
  getAnchors: () => PrototypeAnchor[];
  getConfirmation: () => ReviewerConfirmation | null;
  getMarkers: () => MarkerRecord[];
  attemptScreenshot: () => Promise<ScreenshotResult | null>;
  removeCurrentTarget: () => void;
  revalidateMarkers: () => void;
  refreshIssues: () => Promise<void>;
  destroy: () => void;
};

type ScreenshotModule = {
  attemptScreenshot: (input: {
    element: Element;
    clickPosition?: { x: number; y: number };
    forceUnavailable?: boolean;
  }) => Promise<import("./types").ScreenshotResult>;
};

function loadScreenshotModule(baseUrl: string): Promise<ScreenshotModule> {
  const injected = (
    window as Window & {
      __PASSOFF_SCREENSHOT_LOADER__?: (base: string) => Promise<ScreenshotModule>;
    }
  ).__PASSOFF_SCREENSHOT_LOADER__;
  if (injected) {
    return injected(baseUrl);
  }
  const url = new URL(SCREENSHOT_CHUNK_FILE, baseUrl);
  url.searchParams.set("v", VERSION);
  return import(
    /* @vite-ignore */ url.href
  ) as Promise<ScreenshotModule>;
}

function savedPictureMessage(screenshot: ScreenshotResult | null): string | undefined {
  if (!screenshot || screenshot.status === "unavailable") {
    return screenshot?.reason;
  }
  if (screenshot.status === "partially-captured") {
    return "Picture saved with this feedback. Some parts could not be included.";
  }
  return "Picture saved with this feedback.";
}

const TOOLBAR_POSITION_KEY = "passoff.sdk.toolbar-position.v1";
const TOOLBAR_EDGE_GAP = 8;

type ToolbarPosition = { left: number; top: number };

function readToolbarPosition(): ToolbarPosition | null {
  try {
    const stored = JSON.parse(
      window.sessionStorage.getItem(TOOLBAR_POSITION_KEY) ?? "null",
    ) as Partial<ToolbarPosition> | null;
    if (
      !stored ||
      !Number.isFinite(stored.left) ||
      !Number.isFinite(stored.top)
    ) {
      return null;
    }
    return { left: Number(stored.left), top: Number(stored.top) };
  } catch {
    return null;
  }
}

function writeToolbarPosition(position: ToolbarPosition | null): void {
  try {
    if (position) {
      window.sessionStorage.setItem(TOOLBAR_POSITION_KEY, JSON.stringify(position));
    } else {
      window.sessionStorage.removeItem(TOOLBAR_POSITION_KEY);
    }
  } catch {
    // The toolbar can still move when browser storage is unavailable.
  }
}

export function mountReview(options: {
  buildId?: string | null;
  assetBaseUrl: string;
  apiBaseUrl?: string;
  sessionToken?: string | null;
  canComment?: boolean;
  theme?: "light" | "dark" | "system";
  onModeChange?: (mode: ReviewMode) => void;
  onSessionEnded?: (reason?: string) => void;
}): ReviewRuntime {
  const host = document.createElement("div");
  host.id = HOST_ROOT_ID;
  host.setAttribute("data-passoff-ui", "true");
  host.style.cssText =
    "position:fixed;inset:0;pointer-events:none;z-index:2147483000;contain:layout style;";
  const shadow = host.attachShadow({ mode: "open" });
  const style = document.createElement("style");
  style.textContent = REVIEW_STYLES;
  const root = document.createElement("div");
  root.className = "passoff-root";
  if (options.theme && options.theme !== "system") {
    root.dataset.theme = options.theme;
  }
  shadow.append(style, root);
  document.documentElement.append(host);

  const live = document.createElement("div");
  live.className = "visually-hidden";
  live.setAttribute("aria-live", "polite");
  live.setAttribute("role", "status");

  const toolbar = document.createElement("div");
  toolbar.className = "toolbar";
  toolbar.setAttribute("role", "region");
  toolbar.setAttribute("aria-label", "Passoff review");

  const moveInstructions = document.createElement("span");
  moveInstructions.className = "visually-hidden";
  moveInstructions.id = "passoff-toolbar-move-instructions";
  moveInstructions.textContent =
    "Drag to move the toolbar. You can also use the arrow keys. Press Home to return it to the default location.";

  const moveButton = document.createElement("button");
  moveButton.className = "button move-handle";
  moveButton.type = "button";
  moveButton.setAttribute("aria-label", "Move Passoff toolbar");
  moveButton.setAttribute("aria-describedby", moveInstructions.id);
  moveButton.title = "Move toolbar";
  const moveIcon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  moveIcon.setAttribute("viewBox", "0 0 20 20");
  moveIcon.setAttribute("aria-hidden", "true");
  moveIcon.innerHTML = `
    <circle cx="7" cy="5" r="1.5" fill="currentColor" />
    <circle cx="13" cy="5" r="1.5" fill="currentColor" />
    <circle cx="7" cy="10" r="1.5" fill="currentColor" />
    <circle cx="13" cy="10" r="1.5" fill="currentColor" />
    <circle cx="7" cy="15" r="1.5" fill="currentColor" />
    <circle cx="13" cy="15" r="1.5" fill="currentColor" />
  `;
  moveButton.append(moveIcon);

  const brand = document.createElement("span");
  brand.className = "brand";
  const brandMark = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  brandMark.setAttribute("viewBox", "0 0 128 80");
  brandMark.setAttribute("width", "42");
  brandMark.setAttribute("height", "27");
  brandMark.setAttribute("aria-hidden", "true");
  brandMark.innerHTML = `
    <circle cx="22" cy="17" r="11" fill="var(--primary)" />
    <path d="M10 72C6 63 7 50 11 41c4-8 11-12 18-10 8 2 10 11 14 18 4 6 9 8 15 6l5-2 5 13-5 2c-13 6-25 1-32-7-1 7-7 12-14 13-3 0-5-1-7-2Z" fill="var(--primary)" />
    <circle cx="106" cy="17" r="11" fill="currentColor" />
    <path d="M118 72c4-9 3-22-1-31-4-8-11-12-18-10-8 2-10 11-14 18-4 6-9 8-15 6l-5-2-5 13 5 2c13 6 25 1 32-7 1 7 7 12 14 13 3 0 5-1 7-2Z" fill="currentColor" />
    <g transform="rotate(7 64 49)">
      <rect x="54" y="39" width="20" height="19" rx="5" fill="var(--primary)" stroke="currentColor" stroke-width="3" />
      <circle cx="60" cy="46" r="2" fill="currentColor" />
      <path d="M65 45h5M59 51h11" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" />
    </g>
  `;
  const brandName = document.createElement("span");
  brandName.textContent = "Passoff";
  brand.append(brandMark, brandName);

  const modeLabel = document.createElement("span");
  modeLabel.className = "mode-label";
  modeLabel.id = "passoff-mode-label";

  const browseButton = document.createElement("button");
  browseButton.className = "button";
  browseButton.type = "button";
  browseButton.textContent = "Browse";

  const feedbackButton = document.createElement("button");
  feedbackButton.className = "button";
  feedbackButton.type = "button";
  feedbackButton.dataset.variant = "primary";
  feedbackButton.textContent = "Add feedback";

  const keyboardButton = document.createElement("button");
  keyboardButton.className = "button";
  keyboardButton.type = "button";
  keyboardButton.textContent = "Select with keyboard";

  const closeButton = document.createElement("button");
  closeButton.className = "button";
  closeButton.type = "button";
  closeButton.textContent = "Hide";

  toolbar.append(
    moveInstructions,
    moveButton,
    brand,
    modeLabel,
    browseButton,
    feedbackButton,
    keyboardButton,
    closeButton,
  );

  const launcher = document.createElement("button");
  launcher.className = "button launcher";
  launcher.type = "button";
  launcher.dataset.variant = "primary";
  launcher.textContent = "Show Passoff";
  launcher.hidden = true;

  const highlight = document.createElement("div");
  highlight.className = "highlight";
  highlight.hidden = true;

  const banner = document.createElement("div");
  banner.className = "selecting-banner";
  banner.hidden = true;
  banner.textContent = "Add feedback is on. Choose something on the page.";

  const panel = document.createElement("div");
  panel.className = "panel";
  panel.hidden = true;
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-modal", "true");
  panel.setAttribute("aria-labelledby", "passoff-confirm-title");

  const panelTitle = document.createElement("h2");
  panelTitle.id = "passoff-confirm-title";

  const panelBody = document.createElement("p");
  panelBody.id = "passoff-confirm-desc";

  const form = document.createElement("form");
  form.className = "feedback-form";
  form.hidden = true;

  const label = document.createElement("label");
  label.className = "field-label";
  label.htmlFor = "passoff-feedback";
  label.textContent = "Feedback";

  const textarea = document.createElement("textarea");
  textarea.id = "passoff-feedback";
  textarea.name = "feedback";
  textarea.rows = 4;
  textarea.required = true;
  textarea.setAttribute("aria-required", "true");
  textarea.placeholder = "Describe what should change";

  const fieldError = document.createElement("p");
  fieldError.className = "field-error";
  fieldError.id = "passoff-feedback-error";
  fieldError.hidden = true;

  textarea.setAttribute("aria-describedby", "passoff-confirm-desc");

  const formStatus = document.createElement("p");
  formStatus.className = "form-status";
  formStatus.setAttribute("role", "status");
  formStatus.hidden = true;

  const actions = document.createElement("div");
  actions.className = "form-actions";

  const submitButton = document.createElement("button");
  submitButton.className = "button";
  submitButton.dataset.variant = "primary";
  submitButton.type = "submit";
  submitButton.textContent = "Add feedback";

  const cancelButton = document.createElement("button");
  cancelButton.className = "button";
  cancelButton.type = "button";
  cancelButton.textContent = "Cancel";

  const retryButton = document.createElement("button");
  retryButton.className = "button";
  retryButton.type = "button";
  retryButton.textContent = "Try again";
  retryButton.hidden = true;

  actions.append(submitButton, cancelButton, retryButton);
  form.append(label, textarea, fieldError, formStatus, actions);

  const panelStatus = document.createElement("div");
  panelStatus.className = "status";

  const summaryClose = document.createElement("button");
  summaryClose.className = "button";
  summaryClose.type = "button";
  summaryClose.textContent = "Close";
  summaryClose.hidden = true;

  panel.append(panelTitle, panelBody, form, panelStatus, summaryClose);
  root.append(live, toolbar, launcher, highlight, banner, panel);

  let mode: ReviewMode = "browse";
  let collapsed = false;
  let confirmation: ReviewerConfirmation | null = null;
  let lastScreenshot: ScreenshotResult | null = null;
  let pendingAnchor: PrototypeAnchor | null = null;
  let pendingElement: Element | null = null;
  let pendingIdempotencyKey: string | null = null;
  let composing = false;
  let submitting = false;
  let canComment = options.canComment !== false;
  let sessionEnded = false;
  let previousFocus: Element | null = null;
  const anchors: PrototypeAnchor[] = [];
  const markerHost = document.createElement("div");
  root.append(markerHost);

  const markers = createMarkerLayer({
    overlay: markerHost,
    onSelect(marker) {
      confirmation = {
        title: `Issue ${marker.number}`,
        description: marker.summary ?? "Saved feedback on this page.",
        markerNumber: marker.number,
        issueId: marker.issueId,
        summary: marker.summary,
        statusLabel: marker.statusLabel,
        targetMissing: marker.missing,
      };
      composing = false;
      renderPanel();
      live.textContent = `Issue ${marker.number}${marker.statusLabel ? `, ${marker.statusLabel}` : ""}.`;
    },
    onMissing(marker) {
      if (composing) return;
      confirmation = {
        title: "Original element not found",
        description:
          "The place this feedback pointed to is no longer on the page. The captured details are still available to the team.",
        markerNumber: marker.number,
        targetMissing: true,
        issueId: marker.issueId,
        summary: marker.summary,
        statusLabel: marker.statusLabel,
      };
      renderPanel();
      live.textContent = "Original element not found.";
    },
  });
  markers.start();

  let toolbarPosition = readToolbarPosition();

  const applyToolbarPosition = (
    position: ToolbarPosition,
    persist = true,
  ): ToolbarPosition => {
    const rect = toolbar.getBoundingClientRect();
    const maxLeft = Math.max(
      TOOLBAR_EDGE_GAP,
      window.innerWidth - rect.width - TOOLBAR_EDGE_GAP,
    );
    const maxTop = Math.max(
      TOOLBAR_EDGE_GAP,
      window.innerHeight - rect.height - TOOLBAR_EDGE_GAP,
    );
    toolbarPosition = {
      left: Math.min(Math.max(position.left, TOOLBAR_EDGE_GAP), maxLeft),
      top: Math.min(Math.max(position.top, TOOLBAR_EDGE_GAP), maxTop),
    };
    toolbar.dataset.placement = "custom";
    toolbar.style.left = `${toolbarPosition.left}px`;
    toolbar.style.top = `${toolbarPosition.top}px`;
    toolbar.style.right = "auto";
    toolbar.style.bottom = "auto";
    if (persist) writeToolbarPosition(toolbarPosition);
    return toolbarPosition;
  };

  const resetToolbarPosition = () => {
    toolbarPosition = null;
    writeToolbarPosition(null);
    toolbar.style.removeProperty("left");
    toolbar.style.removeProperty("top");
    toolbar.style.removeProperty("right");
    toolbar.style.removeProperty("bottom");
    toolbar.dataset.placement = window.innerWidth < 768 ? "mobile" : "desktop";
  };

  const positionChrome = () => {
    const mobile = window.innerWidth < 768;
    panel.dataset.placement = mobile ? "mobile" : "desktop";
    if (toolbarPosition) {
      applyToolbarPosition(toolbarPosition);
    } else {
      toolbar.dataset.placement = mobile ? "mobile" : "desktop";
    }
  };
  positionChrome();
  window.addEventListener("resize", positionChrome);

  let toolbarDrag:
    | {
        pointerId: number;
        startX: number;
        startY: number;
        startLeft: number;
        startTop: number;
      }
    | undefined;

  const startToolbarDrag = (event: PointerEvent) => {
    if (event.button !== 0) return;
    const rect = toolbar.getBoundingClientRect();
    toolbarDrag = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startLeft: rect.left,
      startTop: rect.top,
    };
    toolbar.dataset.dragging = "true";
    moveButton.setPointerCapture?.(event.pointerId);
    event.preventDefault();
  };

  const moveToolbar = (event: PointerEvent) => {
    if (!toolbarDrag || event.pointerId !== toolbarDrag.pointerId) return;
    applyToolbarPosition(
      {
        left: toolbarDrag.startLeft + event.clientX - toolbarDrag.startX,
        top: toolbarDrag.startTop + event.clientY - toolbarDrag.startY,
      },
      false,
    );
  };

  const finishToolbarDrag = (event: PointerEvent) => {
    if (!toolbarDrag || event.pointerId !== toolbarDrag.pointerId) return;
    toolbarDrag = undefined;
    delete toolbar.dataset.dragging;
    if (toolbarPosition) writeToolbarPosition(toolbarPosition);
    moveButton.releasePointerCapture?.(event.pointerId);
    live.textContent = "Passoff toolbar moved.";
  };

  moveButton.addEventListener("pointerdown", startToolbarDrag);
  window.addEventListener("pointermove", moveToolbar);
  window.addEventListener("pointerup", finishToolbarDrag);
  window.addEventListener("pointercancel", finishToolbarDrag);
  moveButton.addEventListener("keydown", (event) => {
    if (event.key === "Home") {
      event.preventDefault();
      resetToolbarPosition();
      live.textContent = "Passoff toolbar returned to its default location.";
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
    const step = event.shiftKey ? 40 : 12;
    applyToolbarPosition({
      left: rect.left + movement[0] * step,
      top: rect.top + movement[1] * step,
    });
    live.textContent = "Passoff toolbar moved.";
  });

  const renderMode = () => {
    modeLabel.textContent = mode === "browse" ? "Browsing the page" : "Adding feedback";
    browseButton.setAttribute("aria-pressed", String(mode === "browse"));
    feedbackButton.setAttribute("aria-pressed", String(mode === "add-feedback"));
    feedbackButton.disabled = !canComment;
    banner.hidden = mode !== "add-feedback" || collapsed;
    keyboardButton.hidden = mode !== "add-feedback" || collapsed;
    live.textContent =
      mode === "add-feedback"
        ? "Add feedback is on. Move to an element, then press Enter to choose it. Press Escape to cancel."
        : "Browse is on. The page works as usual.";
  };

  const setFieldError = (message: string | null) => {
    if (!message) {
      fieldError.hidden = true;
      fieldError.textContent = "";
      textarea.removeAttribute("aria-invalid");
      textarea.setAttribute("aria-describedby", "passoff-confirm-desc");
      return;
    }
    fieldError.hidden = false;
    fieldError.textContent = message;
    textarea.setAttribute("aria-invalid", "true");
    textarea.setAttribute(
      "aria-describedby",
      "passoff-confirm-desc passoff-feedback-error",
    );
  };

  const renderPanel = () => {
    if ((!confirmation && !composing) || collapsed) {
      panel.hidden = true;
      return;
    }
    panel.hidden = false;

    if (composing && pendingAnchor) {
      form.hidden = false;
      panelStatus.hidden = true;
      summaryClose.hidden = true;
      panelTitle.textContent = "Add feedback";
      panelBody.textContent = `This will be attached to ${reviewerDescription(pendingAnchor)}.`;
      if (lastScreenshot?.status === "unavailable") {
        formStatus.hidden = false;
        formStatus.textContent = lastScreenshot.reason;
      } else if (lastScreenshot) {
        formStatus.hidden = false;
        formStatus.textContent = lastScreenshot.reason;
      } else {
        formStatus.hidden = false;
        formStatus.textContent = "Saving picture…";
      }
      queueMicrotask(() => textarea.focus());
      return;
    }

    form.hidden = true;
    panelStatus.hidden = false;
    summaryClose.hidden = false;
    if (confirmation) {
      panelTitle.textContent = confirmation.title;
      panelBody.textContent = confirmation.description;
      const bits = [
        confirmation.issueId ? `Issue ${confirmation.markerNumber}` : null,
        confirmation.statusLabel ? `Status: ${confirmation.statusLabel}` : null,
        confirmation.screenshotReason,
      ].filter(Boolean);
      panelStatus.textContent =
        bits.join(" · ") || "Feedback details were captured.";
    }
  };

  const selection = createSelectionController({
    onChange({ element, announcement }) {
      if (!element) {
        highlight.hidden = true;
        live.textContent = announcement;
        return;
      }
      const rect = element.getBoundingClientRect();
      highlight.hidden = false;
      highlight.style.left = `${rect.left}px`;
      highlight.style.top = `${rect.top}px`;
      highlight.style.width = `${rect.width}px`;
      highlight.style.height = `${rect.height}px`;
      live.textContent = announcement;
    },
    onConfirm(element, point) {
      if (!element.isConnected) {
        live.textContent =
          "That element is no longer on the page. Choose something else.";
        return;
      }
      previousFocus = document.activeElement;
      const anchor = captureAnchor(element, point, { buildId: options.buildId });
      pendingAnchor = anchor;
      pendingElement = element;
      pendingIdempotencyKey = createIdempotencyKey();
      lastScreenshot = null;
      confirmation = null;
      composing = true;
      setFieldError(null);
      formStatus.hidden = true;
      retryButton.hidden = true;
      submitButton.hidden = false;
      cancelButton.hidden = false;
      setMode("browse");
      renderPanel();
      void capturePicture(element, anchor);
    },
    onCancel() {
      setMode("browse");
    },
  });

  async function capturePicture(element: Element, anchor: PrototypeAnchor) {
    try {
      const screenshot = await loadScreenshotModule(options.assetBaseUrl);
      lastScreenshot = await screenshot.attemptScreenshot({
        element,
        clickPosition: {
          x: anchor.normalizedPosition.x,
          y: anchor.normalizedPosition.y,
        },
      });
    } catch {
      // Annotation/screenshot failures must never block written feedback.
      lastScreenshot = {
        status: "unavailable",
        reason:
          "Passoff couldn't capture a picture of this page. You can still send your feedback.",
        limitations: ["module"],
        capturedAt: new Date().toISOString(),
      };
    }
    if (composing) {
      renderPanel();
    }
  }

  function restoreFocus() {
    if (previousFocus instanceof HTMLElement && previousFocus.isConnected) {
      previousFocus.focus();
    } else {
      feedbackButton.focus();
    }
    previousFocus = null;
  }

  function clearComposer() {
    composing = false;
    pendingAnchor = null;
    pendingElement = null;
    pendingIdempotencyKey = null;
    textarea.value = "";
    setFieldError(null);
    formStatus.hidden = true;
    retryButton.hidden = true;
    submitButton.hidden = false;
    cancelButton.hidden = false;
    submitting = false;
    submitButton.disabled = false;
  }

  async function submitFeedback() {
    if (!pendingAnchor || submitting) return;
    const text = textarea.value.trim();
    if (!text) {
      setFieldError("Enter your feedback before adding it.");
      textarea.focus();
      return;
    }
    setFieldError(null);

    if (!options.sessionToken || !options.apiBaseUrl) {
      // Prototype / local harness path — keep capture-only behavior.
      anchors.push(pendingAnchor);
      const marker = markers.add(pendingElement ?? document.body, pendingAnchor);
      confirmation = {
        title: "Feedback place captured",
        description: reviewerDescription(pendingAnchor),
        markerNumber: marker.number,
        screenshotStatus: lastScreenshot?.status,
        screenshotReason: lastScreenshot?.reason,
      };
      clearComposer();
      renderPanel();
      live.textContent = `Feedback ${marker.number} captured.`;
      restoreFocus();
      return;
    }

    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      formStatus.hidden = false;
      formStatus.textContent = "You’re offline. Reconnect, then try again.";
      retryButton.hidden = false;
      live.textContent = "You’re offline.";
      return;
    }

    if (pendingElement && !pendingElement.isConnected) {
      formStatus.hidden = false;
      formStatus.textContent =
        "The selected element is no longer on the page. Cancel and choose it again.";
      live.textContent = "Selected element is no longer on the page.";
      return;
    }

    submitting = true;
    submitButton.disabled = true;
    submitButton.textContent = "Adding feedback…";
    formStatus.hidden = false;
    formStatus.textContent = "Saving your feedback…";
    retryButton.hidden = true;

    const key = pendingIdempotencyKey ?? createIdempotencyKey();
    pendingIdempotencyKey = key;
    const pageUrl =
      normalizePageUrlClient(pendingAnchor.pageUrl) ?? window.location.href;

    const result = await createIssue({
      apiBaseUrl: options.apiBaseUrl,
      sessionToken: options.sessionToken,
      body: text,
      pageUrl,
      anchor: pendingAnchor,
      screenshot: lastScreenshot,
      idempotencyKey: key,
    });

    submitting = false;
    submitButton.disabled = false;
    submitButton.textContent = "Add feedback";

    if (!result.ok) {
      formStatus.hidden = false;
      formStatus.textContent =
        result.message ??
        "Passoff couldn’t save that feedback. Your text is still here — try again.";
      retryButton.hidden = false;
      live.textContent = "Feedback wasn’t saved. You can try again.";
      return;
    }

    anchors.push(pendingAnchor);
    markers.add(pendingElement ?? document.body, pendingAnchor, {
      number: result.issue.number,
      issueId: result.issue.id,
      statusLabel: result.issue.statusLabel,
      summary: result.issue.summary,
    });
    confirmation = {
      title: "Feedback sent",
      description: result.issue.summary,
      markerNumber: result.issue.number,
      issueId: result.issue.id,
      statusLabel: result.issue.statusLabel,
      summary: result.issue.summary,
      screenshotStatus: lastScreenshot?.status,
      screenshotReason: savedPictureMessage(lastScreenshot),
    };
    clearComposer();
    renderPanel();
    live.textContent = `Feedback sent. Issue ${result.issue.number} was saved.`;
    restoreFocus();
  }

  async function refreshIssues() {
    if (!options.sessionToken || !options.apiBaseUrl) {
      markers.refresh();
      return;
    }
    const pageUrl = normalizePageUrlClient(window.location.href);
    if (!pageUrl) return;
    const listed = await fetchIssues({
      apiBaseUrl: options.apiBaseUrl,
      sessionToken: options.sessionToken,
      pageUrl,
    });
    if (!listed.ok) {
      if (
        !sessionEnded &&
        listed.error &&
        ["invalid", "expired", "revoked", "closed", "archived", "disabled"].includes(
          listed.error,
        )
      ) {
        sessionEnded = true;
        options.onSessionEnded?.(listed.error);
        return;
      }
      live.textContent =
        listed.message ?? "Passoff couldn’t refresh feedback markers.";
      markers.refresh();
      return;
    }
    canComment = listed.canComment;
    feedbackButton.disabled = !canComment;
    markers.replaceWithRemote(listed.issues as SdkRemoteIssue[]);
  }

  function setMode(next: ReviewMode) {
    mode = next;
    selection.stop();
    highlight.hidden = true;
    if (mode === "add-feedback" && !collapsed && canComment) {
      selection.start("pointer");
    }
    renderMode();
    options.onModeChange?.(mode);
  }

  function setCollapsed(next: boolean) {
    collapsed = next;
    toolbar.hidden = collapsed;
    launcher.hidden = !collapsed;
    banner.hidden = collapsed || mode !== "add-feedback";
    if (collapsed) {
      selection.stop();
      highlight.hidden = true;
    } else if (mode === "add-feedback" && canComment) {
      selection.start("pointer");
    }
    renderPanel();
  }

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    void submitFeedback();
  });
  cancelButton.addEventListener("click", () => {
    clearComposer();
    confirmation = null;
    panel.hidden = true;
    restoreFocus();
  });
  retryButton.addEventListener("click", () => {
    void submitFeedback();
  });
  summaryClose.addEventListener("click", () => {
    confirmation = null;
    panel.hidden = true;
    restoreFocus();
  });

  browseButton.addEventListener("click", () => setMode("browse"));
  feedbackButton.addEventListener("click", () => setMode("add-feedback"));
  keyboardButton.addEventListener("click", () => {
    setMode("add-feedback");
    selection.stop();
    selection.start("keyboard");
    live.textContent =
      "Keyboard selection is on. Use arrow keys to move, Enter to choose, and Escape to cancel.";
  });
  closeButton.addEventListener("click", () => setCollapsed(true));
  launcher.addEventListener("click", () => setCollapsed(false));

  panel.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.stopPropagation();
      if (composing) {
        clearComposer();
        confirmation = null;
        panel.hidden = true;
        restoreFocus();
      } else {
        confirmation = null;
        panel.hidden = true;
        restoreFocus();
      }
    }
  });

  setMode("browse");
  void refreshIssues();
  const sessionCheckInterval = window.setInterval(() => {
    void refreshIssues();
  }, 30_000);
  const refreshOnFocus = () => {
    void refreshIssues();
  };
  const refreshOnVisibility = () => {
    if (document.visibilityState === "visible") {
      void refreshIssues();
    }
  };
  window.addEventListener("focus", refreshOnFocus);
  document.addEventListener("visibilitychange", refreshOnVisibility);

  return {
    root: host,
    shadow,
    setMode,
    getMode: () => mode,
    setCollapsed,
    getCollapsed: () => collapsed,
    getAnchors: () => anchors.slice(),
    getConfirmation: () => confirmation,
    getMarkers: () => markers.records(),
    async attemptScreenshot() {
      const last = markers.records().at(-1);
      if (!last?.element || !last.anchor) {
        return null;
      }
      await capturePicture(last.element, last.anchor);
      return lastScreenshot;
    },
    removeCurrentTarget() {
      const last = markers.records().at(-1);
      last?.element?.remove();
      markers.refresh();
    },
    revalidateMarkers() {
      void refreshIssues();
    },
    refreshIssues,
    destroy() {
      selection.stop();
      markers.stop();
      window.clearInterval(sessionCheckInterval);
      window.removeEventListener("resize", positionChrome);
      moveButton.removeEventListener("pointerdown", startToolbarDrag);
      window.removeEventListener("pointermove", moveToolbar);
      window.removeEventListener("pointerup", finishToolbarDrag);
      window.removeEventListener("pointercancel", finishToolbarDrag);
      window.removeEventListener("focus", refreshOnFocus);
      document.removeEventListener("visibilitychange", refreshOnVisibility);
      host.remove();
    },
  };
}
