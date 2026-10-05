"use client";

import { useEffect } from "react";

export const APP_VERSION_POLL_MS = 45_000;
const VERSION_URL = "/api/version";

async function fetchAppVersion(signal?: AbortSignal): Promise<string | null> {
  try {
    const response = await fetch(VERSION_URL, {
      cache: "no-store",
      headers: { Accept: "application/json" },
      signal,
    });
    if (!response.ok) {
      return null;
    }
    const body = (await response.json()) as { version?: unknown };
    return typeof body.version === "string" && body.version.length > 0
      ? body.version
      : null;
  } catch {
    // Offline / aborted / non-JSON responses are ignored until the next check.
    return null;
  }
}

/**
 * Reloads the page when a new deployment is live.
 * Checks on load, whenever this tab receives focus, and every 45 seconds
 * even if the tab is in the background.
 */
export function VersionChecker() {
  useEffect(() => {
    let cancelled = false;
    let baseline: string | null = null;
    let inFlight = false;
    const controller = new AbortController();

    const check = async () => {
      if (cancelled || inFlight) {
        return;
      }
      inFlight = true;
      try {
        const version = await fetchAppVersion(controller.signal);
        if (cancelled || !version) {
          return;
        }
        if (baseline === null) {
          baseline = version;
          return;
        }
        if (version !== baseline) {
          window.location.reload();
        }
      } finally {
        inFlight = false;
      }
    };

    void check();
    const intervalId = window.setInterval(() => {
      void check();
    }, APP_VERSION_POLL_MS);

    const onTabFocus = () => {
      if (document.visibilityState === "visible") {
        void check();
      }
    };
    window.addEventListener("focus", onTabFocus);
    document.addEventListener("visibilitychange", onTabFocus);

    return () => {
      cancelled = true;
      controller.abort();
      window.clearInterval(intervalId);
      window.removeEventListener("focus", onTabFocus);
      document.removeEventListener("visibilitychange", onTabFocus);
    };
  }, []);

  return null;
}
