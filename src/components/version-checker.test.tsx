import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  APP_VERSION_POLL_MS,
  VersionChecker,
} from "@/components/version-checker";

describe("VersionChecker", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("reloads when the polled version changes", async () => {
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
      await vi.advanceTimersByTimeAsync(APP_VERSION_POLL_MS);
    });
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("does not reload when the version stays the same", async () => {
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

    await act(async () => {
      await vi.advanceTimersByTimeAsync(APP_VERSION_POLL_MS * 2);
    });
    expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(3);
    expect(reload).not.toHaveBeenCalled();
  });
});
