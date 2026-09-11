import "server-only";

import { createHash } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import { del, get, list, put } from "@vercel/blob";

import type { TenantContext } from "@/lib/tenant/context";

const DATA_URL_RE = /^data:image\/(png|jpeg|jpg|webp|gif);base64,([A-Za-z0-9+/=\s]+)$/i;

function isProductionRuntime() {
  return process.env.NODE_ENV === "production" || process.env.VERCEL === "1";
}

function requireBlobToken() {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) {
    throw new Error("BLOB_READ_WRITE_TOKEN is required for production Figma preview storage.");
  }
  return token;
}

function localRoot() {
  return path.resolve(
    /* turbopackIgnore: true */ process.env.PASSOFF_PREVIEW_STORAGE_DIR ||
      path.join(/* turbopackIgnore: true */ process.cwd(), ".data", "figma-previews"),
  );
}

function safeSegment(value: string) {
  return createHash("sha256").update(value).digest("hex").slice(0, 32);
}

function previewPathname(tenant: TenantContext, fileKey: string, nodeId: string) {
  return `workspaces/${tenant.workspaceId}/figma/${tenant.projectId}/${safeSegment(fileKey)}/${safeSegment(nodeId)}.png`;
}

function previewFilePrefix(tenant: TenantContext, fileKey: string) {
  return `workspaces/${tenant.workspaceId}/figma/${tenant.projectId}/${safeSegment(fileKey)}/`;
}

function previewProjectPrefix(tenant: TenantContext) {
  return `workspaces/${tenant.workspaceId}/figma/${tenant.projectId}/`;
}

function versionPreviewPathname(
  tenant: TenantContext,
  designId: string,
  designVersionId: string,
  nodeId: string,
) {
  return `workspaces/${tenant.workspaceId}/project-designs/${tenant.projectId}/${designId}/${designVersionId}/${safeSegment(nodeId)}.png`;
}

function localFilePath(tenant: TenantContext, fileKey: string, nodeId: string) {
  return path.join(
    localRoot(),
    safeSegment(tenant.projectId),
    safeSegment(fileKey),
    `${safeSegment(nodeId)}.png`,
  );
}

function localVersionFilePath(
  tenant: TenantContext,
  designId: string,
  designVersionId: string,
  nodeId: string,
) {
  return path.join(
    localRoot(),
    "versions",
    safeSegment(tenant.projectId),
    designId,
    designVersionId,
    `${safeSegment(nodeId)}.png`,
  );
}

export function previewPublicUrl(fileKey: string, nodeId: string, projectKey?: string) {
  const params = new URLSearchParams({ fileKey, nodeId });
  if (projectKey) params.set("projectKey", projectKey);
  return `/api/integrations/figma/previews?${params.toString()}`;
}

export function designVersionPreviewPublicUrl(
  designVersionId: string,
  nodeId: string,
  projectKey?: string,
) {
  const params = new URLSearchParams({ designVersionId, nodeId });
  if (projectKey) params.set("projectKey", projectKey);
  return `/api/integrations/figma/previews?${params.toString()}`;
}

export function isDataImageUrl(value: string | null | undefined): value is string {
  return Boolean(value && DATA_URL_RE.test(value));
}

export function isStoredPreviewUrl(value: string | null | undefined): boolean {
  return Boolean(value && value.startsWith("/api/integrations/figma/previews?"));
}

export async function writePreviewPng(
  tenant: TenantContext,
  fileKey: string,
  nodeId: string,
  bytes: Buffer,
) {
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    const pathname = previewPathname(tenant, fileKey, nodeId);
    await put(pathname, bytes, {
      access: "private",
      token: requireBlobToken(),
      contentType: "image/png",
      addRandomSuffix: false,
      allowOverwrite: true,
    });
    return previewPublicUrl(fileKey, nodeId, tenant.projectId);
  }

  if (isProductionRuntime()) {
    throw new Error("BLOB_READ_WRITE_TOKEN is required in production.");
  }

  const absolute = localFilePath(tenant, fileKey, nodeId);
  await mkdir(path.dirname(absolute), { recursive: true });
  await writeFile(absolute, bytes);
  return previewPublicUrl(fileKey, nodeId, tenant.projectId);
}

export async function writeDesignVersionPreviewPng(
  tenant: TenantContext,
  designId: string,
  designVersionId: string,
  nodeId: string,
  bytes: Buffer,
) {
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    await put(versionPreviewPathname(tenant, designId, designVersionId, nodeId), bytes, {
      access: "private",
      token: requireBlobToken(),
      contentType: "image/png",
      addRandomSuffix: false,
      allowOverwrite: false,
    });
    return;
  }
  if (isProductionRuntime()) {
    throw new Error("BLOB_READ_WRITE_TOKEN is required in production.");
  }
  const absolute = localVersionFilePath(tenant, designId, designVersionId, nodeId);
  await mkdir(path.dirname(absolute), { recursive: true });
  await writeFile(absolute, bytes, { flag: "wx" });
}

export async function readPreviewPng(tenant: TenantContext, fileKey: string, nodeId: string) {
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    try {
      const result = await get(previewPathname(tenant, fileKey, nodeId), {
        access: "private",
        token: requireBlobToken(),
      });
      if (!result || result.statusCode !== 200 || !result.stream) return null;
      const reader = result.stream.getReader();
      const chunks: Uint8Array[] = [];
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) chunks.push(value);
      }
      return Buffer.concat(chunks.map((c) => Buffer.from(c)));
    } catch {
      return null;
    }
  }

  if (isProductionRuntime()) {
    throw new Error("BLOB_READ_WRITE_TOKEN is required in production.");
  }

  try {
    return await readFile(localFilePath(tenant, fileKey, nodeId));
  } catch {
    return null;
  }
}

export async function readDesignVersionPreviewPng(
  tenant: TenantContext,
  designId: string,
  designVersionId: string,
  nodeId: string,
) {
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    try {
      const result = await get(versionPreviewPathname(tenant, designId, designVersionId, nodeId), {
        access: "private",
        token: requireBlobToken(),
      });
      if (!result || result.statusCode !== 200 || !result.stream) return null;
      const reader = result.stream.getReader();
      const chunks: Uint8Array[] = [];
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) chunks.push(value);
      }
      return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)));
    } catch {
      return null;
    }
  }
  if (isProductionRuntime()) {
    throw new Error("BLOB_READ_WRITE_TOKEN is required in production.");
  }
  try {
    return await readFile(localVersionFilePath(tenant, designId, designVersionId, nodeId));
  } catch {
    return null;
  }
}

export async function clearDesignVersionPreviews(
  tenant: TenantContext,
  designId: string,
  designVersionId: string,
  nodeIds: string[],
) {
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    await Promise.all(nodeIds.map(async (nodeId) => {
      try {
        await del(versionPreviewPathname(tenant, designId, designVersionId, nodeId), {
          token: requireBlobToken(),
        });
      } catch {
        // Database deletion is authoritative; object cleanup is best effort.
      }
    }));
    return;
  }
  try {
    await rm(path.dirname(localVersionFilePath(tenant, designId, designVersionId, "__version__")), {
      recursive: true,
      force: true,
    });
  } catch {
    // ignore missing files
  }
}

export async function deletePreviewPng(tenant: TenantContext, fileKey: string, nodeId: string) {
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    try {
      await del(previewPathname(tenant, fileKey, nodeId), { token: requireBlobToken() });
    } catch {
      // ignore
    }
    return;
  }
  try {
    await rm(localFilePath(tenant, fileKey, nodeId), { force: true });
  } catch {
    // ignore missing files
  }
}

async function clearBlobPrefix(prefix: string) {
  const token = requireBlobToken();
  const pathnames: string[] = [];
  let cursor: string | undefined;
  do {
    const page = await list({ token, prefix, cursor, limit: 1000 });
    pathnames.push(...page.blobs.map((blob) => blob.pathname));
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);

  for (let start = 0; start < pathnames.length; start += 100) {
    await del(pathnames.slice(start, start + 100), { token });
  }
}

export async function clearFilePreviews(tenant: TenantContext, fileKey: string) {
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    try {
      await clearBlobPrefix(previewFilePrefix(tenant, fileKey));
    } catch {
      // Database replacement is authoritative; object cleanup is best effort.
    }
  } else {
    try {
      await rm(path.join(localRoot(), safeSegment(tenant.projectId), safeSegment(fileKey)), {
        recursive: true,
        force: true,
      });
    } catch {
      // ignore
    }
  }
}

export async function clearProjectPreviews(tenant: TenantContext) {
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    try {
      await clearBlobPrefix(previewProjectPrefix(tenant));
    } catch {
      // Database deletion is authoritative; object cleanup is best effort.
    }
  } else {
    try {
      await rm(path.join(localRoot(), safeSegment(tenant.projectId)), {
        recursive: true,
        force: true,
      });
    } catch {
      // ignore
    }
  }
}

export async function storePreviewFromUrl(
  tenant: TenantContext,
  fileKey: string,
  nodeId: string,
  imageUrl: string,
) {
  if (isStoredPreviewUrl(imageUrl)) return imageUrl;
  const match = DATA_URL_RE.exec(imageUrl);
  if (match) {
    const bytes = Buffer.from(match[2].replace(/\s+/g, ""), "base64");
    if (!bytes.length) return null;
    return writePreviewPng(tenant, fileKey, nodeId, bytes);
  }

  // Remote Figma CDN URLs — fetch server-side and persist to Blob (or local in dev).
  if (/^https?:\/\//i.test(imageUrl)) {
    const response = await fetch(imageUrl);
    if (!response.ok) return imageUrl;
    const bytes = Buffer.from(await response.arrayBuffer());
    if (!bytes.length) return null;
    return writePreviewPng(tenant, fileKey, nodeId, bytes);
  }

  return imageUrl;
}
