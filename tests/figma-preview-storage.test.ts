import { afterEach, describe, expect, it, vi } from "vitest";

import type { TenantContext } from "@/lib/tenant/context";

const tenant = {
  workspaceId: "workspace-1",
  projectId: "project-1",
} as TenantContext;

const previousBlobToken = process.env.BLOB_READ_WRITE_TOKEN;

afterEach(() => {
  vi.resetModules();
  vi.restoreAllMocks();
  vi.doUnmock("@vercel/blob");
  if (previousBlobToken === undefined) delete process.env.BLOB_READ_WRITE_TOKEN;
  else process.env.BLOB_READ_WRITE_TOKEN = previousBlobToken;
});

describe("Figma Blob preview cleanup", () => {
  it("lists and deletes every object under a file prefix", async () => {
    process.env.BLOB_READ_WRITE_TOKEN = "vercel_blob_rw_test";
    const list = vi.fn()
      .mockResolvedValueOnce({
        blobs: [{ pathname: "first.png" }],
        hasMore: true,
        cursor: "next-page",
      })
      .mockResolvedValueOnce({
        blobs: [{ pathname: "second.png" }],
        hasMore: false,
      });
    const del = vi.fn().mockResolvedValue(undefined);
    vi.doMock("@vercel/blob", () => ({
      del,
      get: vi.fn(),
      list,
      put: vi.fn(),
    }));

    const { clearFilePreviews } = await import("@/lib/figma/preview-storage");
    await clearFilePreviews(tenant, "file-1");

    expect(list).toHaveBeenNthCalledWith(1, expect.objectContaining({
      prefix: expect.stringMatching(
        /^workspaces\/workspace-1\/figma\/project-1\/[a-f0-9]{32}\/$/,
      ),
      cursor: undefined,
      limit: 1000,
    }));
    expect(list).toHaveBeenNthCalledWith(2, expect.objectContaining({
      cursor: "next-page",
    }));
    expect(del).toHaveBeenCalledWith(
      ["first.png", "second.png"],
      { token: "vercel_blob_rw_test" },
    );
  });

  it("deletes every mutable preview under a project prefix", async () => {
    process.env.BLOB_READ_WRITE_TOKEN = "vercel_blob_rw_test";
    const list = vi.fn().mockResolvedValue({ blobs: [], hasMore: false });
    vi.doMock("@vercel/blob", () => ({
      del: vi.fn(),
      get: vi.fn(),
      list,
      put: vi.fn(),
    }));

    const { clearProjectPreviews } = await import("@/lib/figma/preview-storage");
    await clearProjectPreviews(tenant);

    expect(list).toHaveBeenCalledWith(expect.objectContaining({
      prefix: "workspaces/workspace-1/figma/project-1/",
    }));
  });
});
