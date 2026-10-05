import { afterEach, describe, expect, it, vi } from "vitest";

import { getAppVersion, resetAppVersionCache } from "@/lib/app-version";

describe("getAppVersion", () => {
  afterEach(() => {
    resetAppVersionCache();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("prefers Vercel deployment id", () => {
    vi.stubEnv("VERCEL_DEPLOYMENT_ID", "dpl_123");
    vi.stubEnv("VERCEL_GIT_COMMIT_SHA", "abc");
    expect(getAppVersion()).toBe("dpl_123");
  });

  it("falls back to commit sha when deployment id is absent", () => {
    vi.stubEnv("VERCEL_DEPLOYMENT_ID", "");
    vi.stubEnv("VERCEL_GIT_COMMIT_SHA", "deadbeef");
    expect(getAppVersion()).toBe("deadbeef");
  });

  it("caches the resolved version for the process", () => {
    vi.stubEnv("PASSOFF_APP_VERSION", "v1");
    expect(getAppVersion()).toBe("v1");
    vi.stubEnv("PASSOFF_APP_VERSION", "v2");
    expect(getAppVersion()).toBe("v1");
  });
});
