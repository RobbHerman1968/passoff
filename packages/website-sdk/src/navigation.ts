import { routeFromUrl } from "./dom";
import { safeListener } from "./safe";
import type { NavigationEvent, NavigationType } from "./types";

export type NavigationTracker = {
  events: NavigationEvent[];
  start: () => void;
  stop: () => void;
};

export function createNavigationTracker(
  onNavigate: (event: NavigationEvent) => void,
): NavigationTracker {
  const events: NavigationEvent[] = [];
  let previousUrl = window.location.href;
  let lastSignature = "";
  let originalPush: History["pushState"] | null = null;
  let originalReplace: History["replaceState"] | null = null;
  let patchedPush: History["pushState"] | null = null;
  let patchedReplace: History["replaceState"] | null = null;
  let started = false;

  const emit = (type: NavigationType) => {
    const currentUrl = window.location.href;
    const signature = `${type}|${previousUrl}|${currentUrl}`;
    const last = events.at(-1);
    if (signature === lastSignature) {
      return;
    }
    if (last && last.currentUrl === currentUrl && Date.now() - Date.parse(last.time) < 50) {
      return;
    }
    lastSignature = signature;
    const event: NavigationEvent = {
      previousUrl,
      currentUrl,
      type,
      time: new Date().toISOString(),
    };
    previousUrl = currentUrl;
    events.push(event);
    onNavigate(event);
  };

  const onPopState = safeListener(() => emit("popstate"));
  const onHashChange = safeListener(() => emit("hashchange"));

  return {
    events,
    start() {
      if (started) {
        return;
      }
      started = true;
      originalPush = history.pushState;
      originalReplace = history.replaceState;
      patchedPush = function patchedPushState(this: History, data, unused, url) {
        const result = originalPush!.apply(this, [data, unused, url]);
        emit("pushState");
        return result;
      };
      patchedReplace = function patchedReplaceState(this: History, data, unused, url) {
        const result = originalReplace!.apply(this, [data, unused, url]);
        emit("replaceState");
        return result;
      };
      history.pushState = patchedPush;
      history.replaceState = patchedReplace;
      window.addEventListener("popstate", onPopState);
      window.addEventListener("hashchange", onHashChange);
      emit("initial");
    },
    stop() {
      if (!started) {
        return;
      }
      started = false;
      if (patchedPush && history.pushState === patchedPush && originalPush) {
        history.pushState = originalPush;
      }
      if (patchedReplace && history.replaceState === patchedReplace && originalReplace) {
        history.replaceState = originalReplace;
      }
      window.removeEventListener("popstate", onPopState);
      window.removeEventListener("hashchange", onHashChange);
      patchedPush = null;
      patchedReplace = null;
    },
  };
}

export function describeNavigation(event: NavigationEvent): string {
  return `${event.type}: ${routeFromUrl(event.previousUrl)} → ${routeFromUrl(event.currentUrl)}`;
}
