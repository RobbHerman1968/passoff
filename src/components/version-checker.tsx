"use client";

import { useEffect } from "react";

export const APP_VERSION_POLL_MS = 15_000;
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
    // Offline / aborted / non-JSON responses are ignored until the next poll.
    return null;
  }
}

/**
 * Polls the deployment version and reloads the page when a new build is live.
 */
export function VersionChecker() {
  useEffect(() => {
    let cancelled = false;
    let baseline: string | null = null;
    const controller = new AbortController();

    const check = async () => {
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
    };

    void check();
    const intervalId = window.setInterval(() => {
      void check();
    }, APP_VERSION_POLL_MS);

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void check();
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      cancelled = true;
      controller.abort();
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, []);

  return null;
}
