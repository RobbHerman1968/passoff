/**
 * Handoff direct-upload authorization (service + multipart production gate).
 * Requires DATABASE_URL for room/status/completion cases.
 */
import { randomBytes } from "node:crypto";
import { config } from "dotenv";
import { and, eq } from "drizzle-orm";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { ensureTestMigrations } from "../helpers/ensure-migrations";

config({ path: ".env" });

const hasDb = Boolean(process.env.DATABASE_URL);

async function seedRoom(stamp: string, status: "DRAFT" | "SENT" | "APPROVED" | "ARCHIVED") {
  const { createPasswordUser } = await import("@/lib/auth/password");
  const { createPrivateTenantForUser } = await import("@/lib/auth/tenant-membership");
  const { db } = await import("@/db");
  const { projects, workspaces } = await import("@/db/schema");

  const user = await createPasswordUser({
    email: `handoff-up-${stamp}@example.com`,
    password: "TestPassword123!",
    name: "Upload Owner",
  });
  const tenant = await createPrivateTenantForUser(user.id);
  const workspace = (
    await db.select().from(workspaces).where(eq(workspaces.id, tenant.workspaceId)).limit(1)
  )[0]!;
  const scope = {
    organizationId: workspace.organizationId,
    organizationName: "",
    workspaceId: tenant.workspaceId,
    workspaceName: "",
    userId: user.id,
    userName: "",
    userEmail: user.email || "",
  };
  const [room] = await db
    .insert(projects)
    .values({
      organizationId: workspace.organizationId,
      workspaceId: tenant.workspaceId,
      name: `Upload ${stamp}`,
      clientName: "Client",
      slug: `upload-${stamp}`,
      status,
      archivedAt: status === "ARCHIVED" ? new Date() : null,
    })
    .returning();
  return { scope, room, tenant, workspace };
}

describe("handoff multipart production gate", () => {
  const originalEnv = {
    NODE_ENV: process.env.NODE_ENV,
    VERCEL: process.env.VERCEL,
    BLOB: process.env.BLOB_READ_WRITE_TOKEN,
  };

  afterEach(() => {
    process.env.NODE_ENV = originalEnv.NODE_ENV;
    if (originalEnv.VERCEL === undefined) delete process.env.VERCEL;
    else process.env.VERCEL = originalEnv.VERCEL;
    if (originalEnv.BLOB === undefined) delete process.env.BLOB_READ_WRITE_TOKEN;
    else process.env.BLOB_READ_WRITE_TOKEN = originalEnv.BLOB;
  });

  it("rejects multipart in production and on Vercel", async () => {
    const { isHandoffMultipartAllowed } = await import("@/lib/rooms/storage");

    process.env.NODE_ENV = "production";
    delete process.env.BLOB_READ_WRITE_TOKEN;
    expect(isHandoffMultipartAllowed()).toBe(false);

    process.env.NODE_ENV = "development";
    process.env.VERCEL = "1";
    expect(isHandoffMultipartAllowed()).toBe(false);

    delete process.env.VERCEL;
    process.env.BLOB_READ_WRITE_TOKEN = "vercel_blob_rw_test";
    expect(isHandoffMultipartAllowed()).toBe(false);

    delete process.env.BLOB_READ_WRITE_TOKEN;
    process.env.NODE_ENV = "development";
    expect(isHandoffMultipartAllowed()).toBe(true);
  });
});

describe("handoff client token constraints", () => {
  it("binds maximumSizeInBytes to meta.size and content types to the authorized MIME only", async () => {
    const { buildHandoffBlobClientTokenConstraints } = await import("@/lib/rooms/service");
    const { MAX_UPLOAD_BYTES } = await import("@/lib/rooms/storage");

    const constraints = buildHandoffBlobClientTokenConstraints({
      pathname: "workspaces/w/rooms/r/handoff/a.zip",
      contentType: "application/zip",
      size: 1024 * 1024,
    });

    expect(constraints.maximumSizeInBytes).toBe(1024 * 1024);
    expect(constraints.maximumSizeInBytes).not.toBe(MAX_UPLOAD_BYTES);
    expect(constraints.allowedContentTypes).toEqual(["application/zip"]);
    expect(constraints.allowedContentTypes).toHaveLength(1);
    expect(constraints.pathname).toBe("workspaces/w/rooms/r/handoff/a.zip");
    expect(constraints.addRandomSuffix).toBe(false);
    expect(constraints.allowOverwrite).toBe(false);
    expect(constraints.validUntil).toBeGreaterThan(Date.now());
    expect(constraints.validUntil).toBeLessThanOrEqual(Date.now() + 60 * 60 * 1000 + 1_000);
  });
});

describe.skipIf(!hasDb)("handoff direct upload authorization", () => {
  beforeAll(async () => {
    await ensureTestMigrations();
  }, 120_000);

  it("nonexistent and cross-workspace rooms cannot obtain an upload token", async () => {
    const stamp = randomBytes(4).toString("hex");
    const a = await seedRoom(`a-${stamp}`, "APPROVED");
    const b = await seedRoom(`b-${stamp}`, "APPROVED");
    const { prepareHandoffDirectUpload } = await import("@/lib/rooms/service");

    await expect(
      prepareHandoffDirectUpload({
        scope: a.scope,
        projectId: "11111111-1111-4111-8111-111111111111",
        fileName: "pack.zip",
        contentType: "application/zip",
        size: 10,
      }),
    ).rejects.toThrow(/not found/i);

    await expect(
      prepareHandoffDirectUpload({
        scope: a.scope,
        projectId: b.room.id,
        fileName: "pack.zip",
        contentType: "application/zip",
        size: 10,
      }),
    ).rejects.toThrow(/not found/i);
  });

  it("draft, sent, and archived rooms cannot obtain a handoff token; approved can", async () => {
    const stamp = randomBytes(4).toString("hex");
    const { prepareHandoffDirectUpload } = await import("@/lib/rooms/service");

    for (const status of ["DRAFT", "SENT", "ARCHIVED"] as const) {
      const ctx = await seedRoom(`${status.toLowerCase()}-${stamp}`, status);
      await expect(
        prepareHandoffDirectUpload({
          scope: ctx.scope,
          projectId: ctx.room.id,
          fileName: "pack.zip",
          contentType: "application/zip",
          size: 10,
        }),
      ).rejects.toThrow(/handoff|archived/i);
    }

    const approved = await seedRoom(`ok-${stamp}`, "APPROVED");
    const meta = await prepareHandoffDirectUpload({
      scope: approved.scope,
      projectId: approved.room.id,
      fileName: "pack.zip",
      contentType: "application/zip",
      size: 42,
    });
    expect(meta.projectId).toBe(approved.room.id);
    expect(meta.workspaceId).toBe(approved.scope.workspaceId);
    expect(meta.organizationId).toBe(approved.scope.organizationId);
    expect(meta.userId).toBe(approved.scope.userId);
    expect(meta.pathname).toContain(`/rooms/${approved.room.id}/handoff/`);
    expect(meta.uploadSessionId).toBe(meta.pathname);
    expect(meta.contentType).toBe("application/zip");
    expect(meta.size).toBe(42);
  });

  it("global MAX_UPLOAD_BYTES remains enforced on prepare and complete", async () => {
    const stamp = randomBytes(4).toString("hex");
    const ctx = await seedRoom(`max-${stamp}`, "APPROVED");
    const { prepareHandoffDirectUpload, completeHandoffDirectUpload } =
      await import("@/lib/rooms/service");
    const { MAX_UPLOAD_BYTES } = await import("@/lib/rooms/storage");

    await expect(
      prepareHandoffDirectUpload({
        scope: ctx.scope,
        projectId: ctx.room.id,
        fileName: "pack.zip",
        contentType: "application/zip",
        size: MAX_UPLOAD_BYTES + 1,
      }),
    ).rejects.toThrow(/1 byte and 25 MB/i);

    await expect(
      prepareHandoffDirectUpload({
        scope: ctx.scope,
        projectId: ctx.room.id,
        fileName: "pack.zip",
        contentType: "application/zip",
        size: 0,
      }),
    ).rejects.toThrow(/1 byte and 25 MB/i);

    const meta = await prepareHandoffDirectUpload({
      scope: ctx.scope,
      projectId: ctx.room.id,
      fileName: "pack.zip",
      contentType: "application/zip",
      size: 12,
    });

    await expect(
      completeHandoffDirectUpload({
        scope: ctx.scope,
        projectId: ctx.room.id,
        meta: { ...meta, size: MAX_UPLOAD_BYTES + 1 },
        blobUrl: meta.pathname,
      }),
    ).rejects.toThrow(/25 MB/i);
  });

  it("completion without a successful Blob upload is rejected; auth mismatches are rejected", async () => {
    const stamp = randomBytes(4).toString("hex");
    const ctx = await seedRoom(`complete-${stamp}`, "APPROVED");
    const { prepareHandoffDirectUpload, completeHandoffDirectUpload } =
      await import("@/lib/rooms/service");

    const meta = await prepareHandoffDirectUpload({
      scope: ctx.scope,
      projectId: ctx.room.id,
      fileName: "pack.zip",
      contentType: "application/zip",
      size: 12,
    });

    await expect(
      completeHandoffDirectUpload({
        scope: ctx.scope,
        projectId: ctx.room.id,
        meta,
        blobUrl: meta.pathname,
      }),
    ).rejects.toThrow(/not found/i);

    await expect(
      completeHandoffDirectUpload({
        scope: ctx.scope,
        projectId: ctx.room.id,
        meta,
        pathname: `workspaces/${ctx.scope.workspaceId}/rooms/other/handoff/x.zip`,
        blobUrl: "https://blob.example/x.zip",
      }),
    ).rejects.toThrow(/not owned|mismatch/i);

    await expect(
      completeHandoffDirectUpload({
        scope: ctx.scope,
        projectId: ctx.room.id,
        meta,
        uploadSessionId: "different-session",
        blobUrl: "https://blob.example/x.zip",
      }),
    ).rejects.toThrow(/session/i);

    await expect(
      completeHandoffDirectUpload({
        scope: ctx.scope,
        projectId: ctx.room.id,
        meta,
        contentType: "image/png",
        blobUrl: "https://blob.example/x.zip",
      }),
    ).rejects.toThrow(/content type/i);

    const otherRoom = await seedRoom(`proj-${stamp}`, "APPROVED");
    await expect(
      completeHandoffDirectUpload({
        scope: ctx.scope,
        projectId: otherRoom.room.id,
        meta,
        blobUrl: "https://blob.example/x.zip",
      }),
    ).rejects.toThrow(/authorization|not found/i);
  });
});

describe.skipIf(!hasDb)("handoff upload size verification (local adapter)", () => {
  const previousBlob = process.env.BLOB_READ_WRITE_TOKEN;

  beforeAll(async () => {
    await ensureTestMigrations();
  }, 120_000);

  beforeEach(async () => {
    delete process.env.BLOB_READ_WRITE_TOKEN;
    const { resetStorageAdapterForTests } = await import("@/lib/rooms/storage");
    resetStorageAdapterForTests();
  });

  afterEach(async () => {
    if (previousBlob === undefined) delete process.env.BLOB_READ_WRITE_TOKEN;
    else process.env.BLOB_READ_WRITE_TOKEN = previousBlob;
    const { resetStorageAdapterForTests } = await import("@/lib/rooms/storage");
    resetStorageAdapterForTests();
  });

  it("rejects declared 1-byte upload when a larger object is stored", async () => {
    const stamp = randomBytes(4).toString("hex");
    const ctx = await seedRoom(`big-${stamp}`, "APPROVED");
    const { prepareHandoffDirectUpload, completeHandoffDirectUpload } =
      await import("@/lib/rooms/service");
    const { writeAssetBytes } = await import("@/lib/rooms/storage");
    const { db } = await import("@/db");
    const { assets, handoffItems } = await import("@/db/schema");

    const meta = await prepareHandoffDirectUpload({
      scope: ctx.scope,
      projectId: ctx.room.id,
      fileName: "pack.zip",
      contentType: "application/zip",
      size: 1,
    });
    await writeAssetBytes(meta.pathname, Buffer.from("PK\u0003\u0004larger"), "application/zip");

    await expect(
      completeHandoffDirectUpload({
        scope: ctx.scope,
        projectId: ctx.room.id,
        meta,
        blobUrl: meta.pathname,
      }),
    ).rejects.toThrow(/size mismatch/i);

    const assetRows = await db.select().from(assets).where(eq(assets.uploadSessionId, meta.uploadSessionId));
    const itemRows = await db
      .select()
      .from(handoffItems)
      .where(eq(handoffItems.projectId, ctx.room.id));
    expect(assetRows).toHaveLength(0);
    expect(itemRows).toHaveLength(0);
  });

  it("rejects when the stored object is smaller than the declared size", async () => {
    const stamp = randomBytes(4).toString("hex");
    const ctx = await seedRoom(`small-${stamp}`, "APPROVED");
    const { prepareHandoffDirectUpload, completeHandoffDirectUpload } =
      await import("@/lib/rooms/service");
    const { writeAssetBytes } = await import("@/lib/rooms/storage");

    const meta = await prepareHandoffDirectUpload({
      scope: ctx.scope,
      projectId: ctx.room.id,
      fileName: "pack.zip",
      contentType: "application/zip",
      size: 64,
    });
    await writeAssetBytes(meta.pathname, Buffer.from("tiny"), "application/zip");

    await expect(
      completeHandoffDirectUpload({
        scope: ctx.scope,
        projectId: ctx.room.id,
        meta,
        blobUrl: meta.pathname,
      }),
    ).rejects.toThrow(/size mismatch/i);
  });

  it("rejects nonexistent objects and does not clear an existing handoff release", async () => {
    const stamp = randomBytes(4).toString("hex");
    const ctx = await seedRoom(`miss-${stamp}`, "APPROVED");
    const {
      prepareHandoffDirectUpload,
      completeHandoffDirectUpload,
      addHandoffItem,
      releaseHandoff,
      listReleasedHandoffItems,
    } = await import("@/lib/rooms/service");
    const { db } = await import("@/db");
    const { assets, handoffItems, projects } = await import("@/db/schema");

    await addHandoffItem({
      scope: ctx.scope,
      projectId: ctx.room.id,
      label: "Existing",
      category: "note",
    });
    await releaseHandoff(ctx.scope, ctx.room.id);
    expect(await listReleasedHandoffItems(ctx.room.id)).toHaveLength(1);

    const meta = await prepareHandoffDirectUpload({
      scope: ctx.scope,
      projectId: ctx.room.id,
      fileName: "pack.zip",
      contentType: "application/zip",
      size: 8,
    });

    await expect(
      completeHandoffDirectUpload({
        scope: ctx.scope,
        projectId: ctx.room.id,
        meta,
        blobUrl: meta.pathname,
      }),
    ).rejects.toThrow(/not found/i);

    expect(await listReleasedHandoffItems(ctx.room.id)).toHaveLength(1);
    const [room] = await db.select().from(projects).where(eq(projects.id, ctx.room.id)).limit(1);
    expect(room?.handoffReleasedAt).toBeTruthy();

    const assetRows = await db.select().from(assets).where(eq(assets.uploadSessionId, meta.uploadSessionId));
    const fileItems = await db
      .select()
      .from(handoffItems)
      .where(and(eq(handoffItems.projectId, ctx.room.id), eq(handoffItems.category, "file")));
    expect(assetRows).toHaveLength(0);
    expect(fileItems).toHaveLength(0);
  });

  it("accepts a matching object, stores verified bytes, and stays idempotent on retry", async () => {
    const stamp = randomBytes(4).toString("hex");
    const ctx = await seedRoom(`ok-${stamp}`, "APPROVED");
    const {
      prepareHandoffDirectUpload,
      completeHandoffDirectUpload,
      addHandoffItem,
      releaseHandoff,
      listReleasedHandoffItems,
    } = await import("@/lib/rooms/service");
    const { writeAssetBytes } = await import("@/lib/rooms/storage");
    const { db } = await import("@/db");
    const { assets } = await import("@/db/schema");

    await addHandoffItem({
      scope: ctx.scope,
      projectId: ctx.room.id,
      label: "Existing",
      category: "note",
    });
    await releaseHandoff(ctx.scope, ctx.room.id);
    expect(await listReleasedHandoffItems(ctx.room.id)).toHaveLength(1);

    const bytes = Buffer.from("PK\u0003\u0004test");
    const meta = await prepareHandoffDirectUpload({
      scope: ctx.scope,
      projectId: ctx.room.id,
      fileName: "pack.zip",
      contentType: "application/zip",
      size: bytes.byteLength,
    });
    const stored = await writeAssetBytes(meta.pathname, bytes, "application/zip");

    const first = await completeHandoffDirectUpload({
      scope: ctx.scope,
      projectId: ctx.room.id,
      meta,
      blobUrl: stored.url || meta.pathname,
    });
    expect(first.idempotent).toBe(false);
    expect(first.releaseCleared).toBe(true);
    expect(first.asset.bytes).toBe(bytes.byteLength);
    expect(await listReleasedHandoffItems(ctx.room.id)).toEqual([]);

    const [persisted] = await db.select().from(assets).where(eq(assets.id, first.asset.id)).limit(1);
    expect(persisted?.bytes).toBe(bytes.byteLength);
    expect(persisted?.objectKey).toBe(meta.pathname);

    const second = await completeHandoffDirectUpload({
      scope: ctx.scope,
      projectId: ctx.room.id,
      meta,
      blobUrl: stored.url || meta.pathname,
    });
    expect(second.idempotent).toBe(true);
    expect(second.asset.id).toBe(first.asset.id);

    const allForSession = await db
      .select()
      .from(assets)
      .where(eq(assets.uploadSessionId, meta.uploadSessionId));
    expect(allForSession).toHaveLength(1);
  });
});

describe("handoff upload blob head verification", () => {
  const previousBlob = process.env.BLOB_READ_WRITE_TOKEN;

  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
    if (previousBlob === undefined) delete process.env.BLOB_READ_WRITE_TOKEN;
    else process.env.BLOB_READ_WRITE_TOKEN = previousBlob;
  });

  it("rejects pathname mismatch, MIME mismatch, URL mismatch, and accepts jpg/jpeg alias", async () => {
    process.env.BLOB_READ_WRITE_TOKEN = "vercel_blob_rw_test_token";
    vi.resetModules();

    const head = vi.fn();
    vi.doMock("@vercel/blob", () => ({
      head,
      del: vi.fn(async () => undefined),
      get: vi.fn(),
      put: vi.fn(),
    }));

    const { verifyPrivateBlobObject, resetStorageAdapterForTests } =
      await import("@/lib/rooms/storage");
    resetStorageAdapterForTests();

    const pathname = "workspaces/w/rooms/r/handoff/pack.zip";

    head.mockResolvedValueOnce({
      pathname: "workspaces/other/rooms/r/handoff/evil.zip",
      url: "https://blob.example/evil.zip",
      downloadUrl: "https://blob.example/evil.zip?download=1",
      size: 12,
      contentType: "application/zip",
      uploadedAt: new Date(),
      contentDisposition: "",
      cacheControl: "",
      etag: "1",
    });
    await expect(
      verifyPrivateBlobObject({
        pathname,
        blobUrl: "https://blob.example/evil.zip",
        expectedContentType: "application/zip",
        expectedSize: 12,
      }),
    ).rejects.toThrow(/pathname mismatch/i);

    head.mockResolvedValueOnce({
      pathname,
      url: "https://blob.example/pack.zip",
      downloadUrl: "https://blob.example/pack.zip?download=1",
      size: 12,
      contentType: "image/png",
      uploadedAt: new Date(),
      contentDisposition: "",
      cacheControl: "",
      etag: "1",
    });
    await expect(
      verifyPrivateBlobObject({
        pathname,
        blobUrl: "https://blob.example/pack.zip",
        expectedContentType: "application/zip",
        expectedSize: 12,
      }),
    ).rejects.toThrow(/content type mismatch/i);

    head.mockResolvedValueOnce({
      pathname,
      url: "https://blob.example/pack.zip",
      downloadUrl: "https://blob.example/pack.zip?download=1",
      size: 12,
      contentType: "application/zip",
      uploadedAt: new Date(),
      contentDisposition: "",
      cacheControl: "",
      etag: "1",
    });
    await expect(
      verifyPrivateBlobObject({
        pathname,
        blobUrl: "https://blob.example/different.zip",
        expectedContentType: "application/zip",
        expectedSize: 12,
      }),
    ).rejects.toThrow(/URL mismatch/i);

    head.mockResolvedValueOnce({
      pathname: "workspaces/w/rooms/r/handoff/photo.jpg",
      url: "https://blob.example/photo.jpg",
      downloadUrl: "https://blob.example/photo.jpg?download=1",
      size: 4,
      contentType: "image/jpeg",
      uploadedAt: new Date(),
      contentDisposition: "",
      cacheControl: "",
      etag: "1",
    });
    const verified = await verifyPrivateBlobObject({
      pathname: "workspaces/w/rooms/r/handoff/photo.jpg",
      blobUrl: "https://blob.example/photo.jpg",
      expectedContentType: "image/jpg",
      expectedSize: 4,
    });
    expect(verified.size).toBe(4);
    expect(verified.contentType).toBe("image/jpeg");
    expect(verified.url).toBe("https://blob.example/photo.jpg");
    expect(verified.pathname).toBe("workspaces/w/rooms/r/handoff/photo.jpg");
  });
});
