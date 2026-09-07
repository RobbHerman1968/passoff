import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import { del, get, put } from "@vercel/blob";

export type StorageObject = {
  pathname: string;
  url?: string | null;
  size: number;
  contentType?: string | null;
};

export type StorageAdapter = {
  readonly provider: "vercel_blob" | "local";
  put(pathname: string, body: Buffer | Uint8Array | ReadableStream, contentType: string): Promise<StorageObject>;
  getStream(pathnameOrUrl: string): Promise<{
    stream: ReadableStream<Uint8Array>;
    contentType: string | null;
    size: number | null;
  } | null>;
  getBytes(pathnameOrUrl: string): Promise<Buffer | null>;
  delete(pathnameOrUrl: string): Promise<void>;
};

function isProductionRuntime() {
  return process.env.NODE_ENV === "production" || process.env.VERCEL === "1";
}

function requireBlobToken() {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) {
    throw new Error(
      "BLOB_READ_WRITE_TOKEN is required for production file storage. Configure a private Vercel Blob store.",
    );
  }
  return token;
}

function localRoot() {
  return path.resolve(
    /* turbopackIgnore: true */ process.env.PASSOFF_ROOM_ASSET_DIR ||
      path.join(/* turbopackIgnore: true */ process.cwd(), ".data", "room-assets"),
  );
}

function assertSafePathname(pathname: string) {
  const segments = pathname.split("/").filter(Boolean);
  if (!segments.length || segments.some((s) => s.includes("..") || s.includes("\\"))) {
    throw new Error("Invalid storage pathname.");
  }
  return segments;
}

class LocalStorageAdapter implements StorageAdapter {
  readonly provider = "local" as const;

  private absolute(pathname: string) {
    return path.join(localRoot(), ...assertSafePathname(pathname));
  }

  async put(pathname: string, body: Buffer | Uint8Array, contentType: string): Promise<StorageObject> {
    const absolute = this.absolute(pathname);
    await mkdir(path.dirname(absolute), { recursive: true });
    const buffer = Buffer.isBuffer(body) ? body : Buffer.from(body);
    await writeFile(absolute, buffer);
    return { pathname, url: null, size: buffer.byteLength, contentType };
  }

  async getStream(pathnameOrUrl: string) {
    const bytes = await this.getBytes(pathnameOrUrl);
    if (!bytes) return null;
    return {
      stream: new ReadableStream({
        start(controller) {
          controller.enqueue(new Uint8Array(bytes));
          controller.close();
        },
      }),
      contentType: null,
      size: bytes.byteLength,
    };
  }

  async getBytes(pathnameOrUrl: string) {
    try {
      return await readFile(this.absolute(pathnameOrUrl));
    } catch {
      return null;
    }
  }

  async delete(pathnameOrUrl: string) {
    try {
      await rm(this.absolute(pathnameOrUrl), { force: true });
    } catch {
      // ignore
    }
  }
}

class VercelBlobStorageAdapter implements StorageAdapter {
  readonly provider = "vercel_blob" as const;

  async put(pathname: string, body: Buffer | Uint8Array | ReadableStream, contentType: string) {
    const token = requireBlobToken();
    const payload =
      body instanceof ReadableStream ? body : Buffer.isBuffer(body) ? body : Buffer.from(body);
    const result = await put(pathname, payload, {
      access: "private",
      token,
      contentType,
      addRandomSuffix: false,
    });
    return {
      pathname: result.pathname,
      url: result.url,
      size: Buffer.isBuffer(payload) ? payload.byteLength : 0,
      contentType: result.contentType,
    };
  }

  async getStream(pathnameOrUrl: string) {
    const token = requireBlobToken();
    const result = await get(pathnameOrUrl, { access: "private", token });
    if (!result || result.statusCode !== 200 || !result.stream) return null;
    return {
      stream: result.stream,
      contentType: result.blob.contentType,
      size: result.blob.size,
    };
  }

  async getBytes(pathnameOrUrl: string) {
    const streamed = await this.getStream(pathnameOrUrl);
    if (!streamed) return null;
    const reader = streamed.stream.getReader();
    const chunks: Uint8Array[] = [];
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) chunks.push(value);
    }
    return Buffer.concat(chunks.map((c) => Buffer.from(c)));
  }

  async delete(pathnameOrUrl: string) {
    const token = requireBlobToken();
    await del(pathnameOrUrl, { token });
  }
}

let cached: StorageAdapter | null = null;

export function getStorageAdapter(): StorageAdapter {
  if (cached) return cached;
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    cached = new VercelBlobStorageAdapter();
    return cached;
  }
  if (isProductionRuntime()) {
    throw new Error(
      "Production storage misconfigured: BLOB_READ_WRITE_TOKEN is required. Local filesystem fallback is disabled in production.",
    );
  }
  cached = new LocalStorageAdapter();
  return cached;
}

export function resetStorageAdapterForTests() {
  cached = null;
}

function safeFilename(filename: string) {
  const base = path.basename(filename).replace(/[^a-zA-Z0-9._-]+/g, "-").slice(0, 120);
  return base || "file.bin";
}

/** Tenant-scoped, non-guessable Blob pathname. */
export function buildTenantObjectPath(input: {
  workspaceId: string;
  projectId: string;
  revisionId: string;
  filename: string;
}) {
  const randomId = randomBytes(16).toString("hex");
  return `workspaces/${input.workspaceId}/rooms/${input.projectId}/revisions/${input.revisionId}/${randomId}-${safeFilename(input.filename)}`;
}

/** Tenant-scoped path for delivery handoff files (not tied to a revision). */
export function buildHandoffObjectPath(input: {
  workspaceId: string;
  projectId: string;
  filename: string;
}) {
  const randomId = randomBytes(16).toString("hex");
  return `workspaces/${input.workspaceId}/rooms/${input.projectId}/handoff/${randomId}-${safeFilename(input.filename)}`;
}

/** @deprecated Prefer buildTenantObjectPath */
export function buildObjectKey(workspaceId: string, projectId: string, filename: string) {
  const ext = path.extname(filename).slice(0, 12) || ".bin";
  return `workspaces/${workspaceId}/rooms/${projectId}/${randomBytes(16).toString("hex")}${ext}`;
}

export async function writeAssetBytes(objectKey: string, bytes: Buffer, contentType = "application/octet-stream") {
  return getStorageAdapter().put(objectKey, bytes, contentType);
}

export async function readAssetBytes(objectKey: string) {
  return getStorageAdapter().getBytes(objectKey);
}

export async function readAssetStream(objectKeyOrUrl: string) {
  return getStorageAdapter().getStream(objectKeyOrUrl);
}

export async function deleteAssetBytes(objectKeyOrUrl: string) {
  return getStorageAdapter().delete(objectKeyOrUrl);
}

export function checksumSha256(bytes: Buffer) {
  return createHash("sha256").update(bytes).digest("hex");
}

export function assetPublicUrl(assetId: string) {
  return `/api/assets/${encodeURIComponent(assetId)}`;
}

export const ALLOWED_UPLOAD_MIME_TYPES = [
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
  "image/gif",
  "application/pdf",
] as const;

/** Broader set for delivery handoff (final packages, etc.). */
export const ALLOWED_HANDOFF_MIME_TYPES = [
  ...ALLOWED_UPLOAD_MIME_TYPES,
  "application/zip",
  "application/x-zip-compressed",
] as const;

export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
