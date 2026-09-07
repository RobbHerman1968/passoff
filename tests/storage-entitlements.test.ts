import { describe, expect, it, vi, beforeEach } from "vitest";

describe("storage adapter production guard", () => {
  beforeEach(() => {
    vi.resetModules();
    delete process.env.BLOB_READ_WRITE_TOKEN;
  });

  it("fails closed in production without BLOB_READ_WRITE_TOKEN", async () => {
    process.env.NODE_ENV = "production";
    process.env.VERCEL = "1";
    const { resetStorageAdapterForTests, getStorageAdapter } = await import("@/lib/rooms/storage");
    resetStorageAdapterForTests();
    expect(() => getStorageAdapter()).toThrow(/BLOB_READ_WRITE_TOKEN/);
  });

  it("uses local adapter in development without Blob token", async () => {
    process.env.NODE_ENV = "development";
    delete process.env.VERCEL;
    const { resetStorageAdapterForTests, getStorageAdapter } = await import("@/lib/rooms/storage");
    resetStorageAdapterForTests();
    const adapter = getStorageAdapter();
    expect(adapter.provider).toBe("local");
  });
});

describe("entitlement trial expiration", () => {
  it("does not invent a rolling 14-day window when subscription is missing", async () => {
    vi.resetModules();
    vi.doMock("@/db", () => ({
      db: {
        select: () => ({
          from: () => ({
            where: () => ({
              orderBy: () => ({
                limit: async () => [],
              }),
            }),
          }),
        }),
      },
    }));
    const { getOrganizationEntitlements } = await import("@/lib/rooms/entitlements");
    const entitlements = await getOrganizationEntitlements("org-missing");
    expect(entitlements.planId).toBe("trial");
    expect(entitlements.isExpired).toBe(true);
    expect(entitlements.canCreateRooms).toBe(false);
    expect(entitlements.trialEndsAt).toBeNull();
  });
});
