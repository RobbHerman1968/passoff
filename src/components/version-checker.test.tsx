import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  APP_VERSION_POLL_MS,
  VersionChecker,
} from "@/components/version-checker";

function stubVisibility(state: DocumentVisibilityState) {
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    get: () => state,
  });
}

describe("VersionChecker", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    stubVisibility("visible");
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("checks once on load and does not reload when the version is unchanged", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ version: "build-1" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const reload = vi.fn();
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { reload },
    });

    render(<VersionChecker />);
    await act(async () => {
      await Promise.resolve();
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(reload).not.toHaveBeenCalled();
  });

  it("reloads when the tab is focused and a new build is live", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ version: "build-1" }),
      })
      .mockResolvedValue({
        ok: true,
        json: async () => ({ version: "build-2" }),
      });
    vi.stubGlobal("fetch", fetchMock);

    const reload = vi.fn();
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { reload },
    });

    render(<VersionChecker />);
    await act(async () => {
      await Promise.resolve();
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(reload).not.toHaveBeenCalled();

    await act(async () => {
      window.dispatchEvent(new Event("focus"));
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("keeps polling in the background and reloads when the version changes", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ version: "build-1" }),
      })
      .mockResolvedValue({
        ok: true,
        json: async () => ({ version: "build-2" }),
      });
    vi.stubGlobal("fetch", fetchMock);

    const reload = vi.fn();
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { reload },
    });

    render(<VersionChecker />);
    await act(async () => {
      await Promise.resolve();
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    stubVisibility("hidden");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(APP_VERSION_POLL_MS);
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(reload).toHaveBeenCalledTimes(1);
  });
});
