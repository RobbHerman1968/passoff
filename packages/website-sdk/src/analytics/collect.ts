import {
  DEAD_CLICK_WAIT_MS,
  FLUSH_INTERVAL_MS,
  MAX_BATCH_BYTES,
  MAX_EVENTS_PER_BATCH,
  REPEAT_CLICK_THRESHOLD,
  REPEAT_CLICK_WINDOW_MS,
  SCROLL_MILESTONES,
  TELEMETRY_SCHEMA_VERSION,
  bucketCoordinate,
  isAllowedAnalyticsLabel,
  viewportGroupFromWidth,
  type AnalyticsBootstrap,
  type ElementCategory,
  type TelemetryEvent,
} from "./contract";
import { hasGlobalPrivacyOptOut, isSessionExcluded } from "./consent";
import {
  isSensitiveRoute,
  normalizeTelemetryRoute,
  stripQueryAndFragment,
} from "./route";
import { eventTouchesSdk } from "../dom";
import { categorizeErrorName, errorFingerprint, sanitizeErrorMessage } from "./sanitize-error";

export type AnalyticsCollector = {
  start: () => void;
  routeChanged: () => void;
  stop: () => void;
};

function uuid(): string {
  return crypto.randomUUID();
}

function tabSession(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
}

export function createCollector(options: {
  config: AnalyticsBootstrap;
  installationKey: string;
  apiBaseUrl: string;
  buildId?: string;
  getRouteTemplate: () => string | undefined;
}): AnalyticsCollector {
  const queue: TelemetryEvent[] = [];
  const seenMilestones = new Set<number>();
  const clicks: Array<{ key: string; at: number }> = [];
  let batchId = uuid();
  const session = tabSession();
  let timer = 0;
  let started = false;
  let flushing = false;
  let domRevision = 0;
  const abort = new AbortController();
  const encoder = new TextEncoder();
  const mutationObserver = new MutationObserver(() => {
    domRevision += 1;
  });

  const sampledIn = Math.random() * 100 < (options.config.samplingPercent ?? 100);

  function currentRoute(): string | null {
    const url = stripQueryAndFragment(window.location.href);
    if (!url) return null;
    const route = normalizeTelemetryRoute(url.pathname, options.getRouteTemplate());
    if (isSensitiveRoute(route, options.config.excludedRoutes ?? [])) return null;
    return route;
  }

  function baseFields(): Omit<TelemetryEvent, "eventType" | "eventId"> | null {
    if (!sampledIn || isSessionExcluded() || hasGlobalPrivacyOptOut()) return null;
    const route = currentRoute();
    if (!route) return null;
    const consentState =
      options.config.mode === "strict_consent" ? "granted" : "aggregate_notice";
    return {
      schemaVersion: TELEMETRY_SCHEMA_VERSION,
      batchId,
      occurredAt: new Date().toISOString(),
      route,
      deploymentVersion: (options.buildId ?? "").slice(0, 120),
      viewportGroup: viewportGroupFromWidth(window.innerWidth),
      sampling: { percent: options.config.samplingPercent ?? 100, selected: true },
      tabSession: session,
      consentState,
      testMode: options.config.testMode,
    };
  }

  function enqueue(event: TelemetryEvent) {
    queue.push(event);
    if (queue.length >= MAX_EVENTS_PER_BATCH) void flush();
  }

  async function flush() {
    if (queue.length === 0 || flushing) return;
    if (isSessionExcluded() || hasGlobalPrivacyOptOut()) {
      queue.length = 0;
      return;
    }
    flushing = true;
    const sendBatchId = uuid();
    let count = Math.min(queue.length, MAX_EVENTS_PER_BATCH);
    let events: TelemetryEvent[] = [];
    let payload = "";
    while (count > 0) {
      events = queue.slice(0, count).map((event) => ({
        ...event,
        batchId: sendBatchId,
      }));
      payload = JSON.stringify({
        schemaVersion: TELEMETRY_SCHEMA_VERSION,
        batchId: sendBatchId,
        installationKey: options.installationKey,
        events,
      });
      if (encoder.encode(payload).byteLength <= MAX_BATCH_BYTES) break;
      count -= 1;
    }
    if (count === 0) {
      // Contract limits should make this unreachable. Remove only the malformed
      // event so it cannot block every later delivery.
      queue.shift();
      flushing = false;
      return;
    }
    try {
      const response = await fetch(`${options.apiBaseUrl}/api/sdk/v1/events`, {
        method: "POST",
        mode: "cors",
        credentials: "omit",
        keepalive: true,
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: payload,
        signal: abort.signal,
      });
      if (response.ok || (response.status >= 400 && response.status < 500 && response.status !== 429)) {
        queue.splice(0, count);
      }
    } catch {
      // Keep the batch queued for the next interval. Ingestion failure must
      // never interrupt the host website.
    } finally {
      flushing = false;
    }
    batchId = uuid();
  }

  function classify(el: Element): { category: ElementCategory; label: string } {
    const labeled = el.closest("[data-passoff-analytics-label]");
    const custom = labeled?.getAttribute("data-passoff-analytics-label")?.trim() ?? "";
    const label = isAllowedAnalyticsLabel(custom) ? custom : "unlabeled";
    if (el.closest("nav")) return { category: "navigation", label };
    if (el.closest('[role="dialog"], dialog')) return { category: "dialog_action", label };
    if (el instanceof HTMLButtonElement || el.getAttribute("role") === "button") {
      if (el.closest("form")) return { category: "form_action", label };
      return { category: "button", label };
    }
    if (el instanceof HTMLAnchorElement) return { category: "link", label };
    return { category: "page_region", label };
  }

  function onClick(event: MouseEvent) {
    if (eventTouchesSdk(event)) return;
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) return;
    const base = baseFields();
    if (!base) return;
    const { category, label } = classify(target);
    const rect = document.documentElement;
    enqueue({
      ...base,
      eventId: uuid(),
      eventType: "element_click",
      elementCategory: category,
      analyticsLabel: label,
      coordinateBucketX: bucketCoordinate(event.pageX / Math.max(rect.scrollWidth, 1)),
      coordinateBucketY: bucketCoordinate(event.pageY / Math.max(rect.scrollHeight, 1)),
    } as TelemetryEvent);

    const key = `${category}|${label}`;
    const now = Date.now();
    clicks.push({ key, at: now });
    const recent = clicks.filter(
      (item) => item.key === key && now - item.at <= REPEAT_CLICK_WINDOW_MS,
    );
    if (recent.length === REPEAT_CLICK_THRESHOLD) {
      enqueue({
        ...base,
        eventId: uuid(),
        eventType: "repeat_click_signal",
        elementCategory: category,
        analyticsLabel: label,
        clickCount: recent.length,
      } as TelemetryEvent);
    }

    const interactive = target.closest("a,button,[role='button'],[role='link']");
    if (interactive instanceof HTMLElement && !interactive.hasAttribute("disabled")) {
      const startingUrl = window.location.href;
      const startingRevision = domRevision;
      const startingExpanded = interactive.getAttribute("aria-expanded");
      const startingPressed = interactive.getAttribute("aria-pressed");
      const href =
        interactive instanceof HTMLAnchorElement ? interactive.getAttribute("href") : null;
      window.setTimeout(() => {
        const still = document.activeElement;
        const changed =
          window.location.href !== startingUrl ||
          domRevision !== startingRevision ||
          interactive.getAttribute("aria-expanded") !== startingExpanded ||
          interactive.getAttribute("aria-pressed") !== startingPressed ||
          interactive.hasAttribute("aria-busy") ||
          interactive.hasAttribute("disabled") ||
          still !== (event.target as Node) ||
          Boolean(document.querySelector("dialog[open], [role='dialog']"));
        if (!changed && !href) {
          const next = baseFields();
          if (!next) return;
          enqueue({
            ...next,
            eventId: uuid(),
            eventType: "dead_click_candidate",
            elementCategory: category,
            analyticsLabel: label,
            waitMs: DEAD_CLICK_WAIT_MS,
          } as TelemetryEvent);
        }
      }, DEAD_CLICK_WAIT_MS);
    }
  }

  function onScroll() {
    const base = baseFields();
    if (!base) return;
    const max = document.documentElement.scrollHeight - window.innerHeight;
    if (max <= 0) {
      if (!seenMilestones.has(100)) {
        seenMilestones.add(100);
        enqueue({
          ...base,
          eventId: uuid(),
          eventType: "scroll_milestone",
          scrollMilestone: 100,
        });
      }
      return;
    }
    const depth = Math.round((window.scrollY / max) * 100);
    for (const milestone of SCROLL_MILESTONES) {
      if (depth >= milestone && !seenMilestones.has(milestone)) {
        seenMilestones.add(milestone);
        enqueue({
          ...base,
          eventId: uuid(),
          eventType: "scroll_milestone",
          scrollMilestone: milestone,
        });
      }
    }
  }

  function onError(event: ErrorEvent) {
    const base = baseFields();
    if (!base) return;
    const category = categorizeErrorName(event.error?.name || event.message);
    const sanitized = sanitizeErrorMessage(event.message || category);
    enqueue({
      ...base,
      eventId: uuid(),
      eventType: "sanitized_javascript_error",
      errorCategory: category,
      errorFingerprint: errorFingerprint(category, sanitized),
      sourceCategory: "unknown",
    });
  }

  function pageView() {
    seenMilestones.clear();
    const base = baseFields();
    if (!base) return;
    enqueue({ ...base, eventId: uuid(), eventType: "page_view" });
    onScroll();
  }

  return {
    start() {
      if (started) return;
      started = true;
      document.addEventListener("click", onClick, { capture: true, passive: true });
      window.addEventListener("scroll", onScroll, { passive: true });
      window.addEventListener("error", onError);
      window.addEventListener("pagehide", onPageHide);
      window.addEventListener("visibilitychange", onVisibilityChange);
      mutationObserver.observe(document.documentElement, {
        attributes: true,
        childList: true,
        characterData: true,
        subtree: true,
      });
      timer = window.setInterval(() => void flush(), FLUSH_INTERVAL_MS);
      pageView();
    },
    routeChanged() {
      if (started) pageView();
    },
    stop() {
      if (!started) return;
      started = false;
      document.removeEventListener("click", onClick, true);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("error", onError);
      window.removeEventListener("pagehide", onPageHide);
      window.removeEventListener("visibilitychange", onVisibilityChange);
      mutationObserver.disconnect();
      window.clearInterval(timer);
      abort.abort();
      queue.length = 0;
    },
  };

  function onPageHide() {
    void flush();
  }

  function onVisibilityChange() {
    if (document.visibilityState === "hidden") void flush();
  }
}
