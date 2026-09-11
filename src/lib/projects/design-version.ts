import "server-only";

import { createHash } from "node:crypto";

export const PROJECT_DESIGN_VERSION_SCHEMA = 2 as const;
export const LEGACY_FIGMA_DESIGN_VERSION_SCHEMA = 1 as const;

export type ProjectDesignVersionPayload = {
  schemaVersion: typeof PROJECT_DESIGN_VERSION_SCHEMA | typeof LEGACY_FIGMA_DESIGN_VERSION_SCHEMA;
  sourceType?: "figma";
  file: {
    key: string;
    name: string;
    sourceVersion: string | null;
    sourceLastModified: string | null;
    mainScreenId: string | null;
    thumbnailScreenId: string | null;
  };
  screens: Array<{
    id: string;
    name: string;
    type: string;
    width: number | null;
    height: number | null;
    x: number | null;
    y: number | null;
    interactionCount: number;
    sortOrder: number;
    breakpointGroupId: string | null;
    preview: {
      nodeId: string;
      contentType: "image/png";
      bytes: number;
      sha256: string;
    } | null;
  }>;
  interactions: Array<{
    sourceNodeId: string;
    sourceNodeName: string;
    sourceScreenId: string;
    destinationNodeId: string | null;
    destinationScreenId: string | null;
    trigger: string;
    actions: unknown;
    sourceBounds: {
      x: number | null;
      y: number | null;
      width: number | null;
      height: number | null;
    };
    sortOrder: number;
  }>;
  breakpointGroups: Array<{
    id: string;
    name: string;
    primaryScreenId: string;
    memberScreenIds: string[];
  }>;
  inspectTrees: Array<{
    screenId: string;
    source: string;
    tree: unknown;
  }>;
  warnings: string[];
};

export type VideoDesignVersionPayload = {
  schemaVersion: typeof PROJECT_DESIGN_VERSION_SCHEMA;
  sourceType: "video";
  video: {
    originalFilename: string;
    mimeType: "video/mp4" | "video/webm";
    byteSize: number;
    durationMs: number;
    width: number | null;
    height: number | null;
    objectKey: string;
    storageProvider: "local" | "vercel_blob";
    blobUrl: string | null;
    sha256: string;
    poster: {
      objectKey: string;
      storageProvider: "local" | "vercel_blob";
      blobUrl: string | null;
      mimeType: string;
      byteSize: number;
      width: number | null;
      height: number | null;
    } | null;
    uploadedAt: string;
  };
};

export type AnyProjectDesignVersionPayload =
  | ProjectDesignVersionPayload
  | VideoDesignVersionPayload;

export function isVideoDesignVersionPayload(
  payload: AnyProjectDesignVersionPayload,
): payload is VideoDesignVersionPayload {
  return payload.schemaVersion === PROJECT_DESIGN_VERSION_SCHEMA
    && payload.sourceType === "video";
}

export function canonicalJson(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "string" || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError("Canonical JSON does not allow non-finite numbers.");
    return JSON.stringify(Object.is(value, -0) ? 0 : value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => {
      if (record[key] === undefined) {
        throw new TypeError("Canonical JSON does not allow undefined values.");
      }
      return `${JSON.stringify(key)}:${canonicalJson(record[key])}`;
    }).join(",")}}`;
  }
  throw new TypeError(`Canonical JSON does not allow ${typeof value} values.`);
}

/** Source timestamps/version labels are provenance, not normalized visual content. */
export function projectDesignContentSha256(payload: ProjectDesignVersionPayload) {
  const digestContent = {
    // Keep the legacy normalized schema marker so adding the explicit Figma
    // discriminator does not create a duplicate immutable version.
    schemaVersion: LEGACY_FIGMA_DESIGN_VERSION_SCHEMA,
    file: {
      key: payload.file.key,
      name: payload.file.name,
      mainScreenId: payload.file.mainScreenId,
      thumbnailScreenId: payload.file.thumbnailScreenId,
    },
    screens: payload.screens,
    interactions: payload.interactions,
    breakpointGroups: payload.breakpointGroups,
    inspectTrees: payload.inspectTrees,
  };
  return createHash("sha256").update(canonicalJson(digestContent), "utf8").digest("hex");
}

export function serializeProjectDesignVersion(payload: ProjectDesignVersionPayload) {
  return canonicalJson(payload);
}

export function videoDesignContentSha256(payload: VideoDesignVersionPayload) {
  return payload.video.sha256;
}

export function serializeAnyProjectDesignVersion(payload: AnyProjectDesignVersionPayload) {
  return canonicalJson(payload);
}

export function parseAnyProjectDesignVersion(payloadJson: string): AnyProjectDesignVersionPayload {
  const payload = JSON.parse(payloadJson) as AnyProjectDesignVersionPayload;
  if (
    payload
    && payload.schemaVersion === PROJECT_DESIGN_VERSION_SCHEMA
    && payload.sourceType === "video"
    && payload.video
    && typeof payload.video.originalFilename === "string"
    && (payload.video.mimeType === "video/mp4" || payload.video.mimeType === "video/webm")
    && Number.isSafeInteger(payload.video.byteSize)
    && payload.video.byteSize > 0
    && Number.isSafeInteger(payload.video.durationMs)
    && payload.video.durationMs > 0
    && typeof payload.video.objectKey === "string"
    && (payload.video.storageProvider === "local" || payload.video.storageProvider === "vercel_blob")
    && /^[0-9a-f]{64}$/.test(payload.video.sha256)
    && typeof payload.video.uploadedAt === "string"
  ) {
    return payload;
  }
  if (
    !payload
    || (
      payload.schemaVersion !== LEGACY_FIGMA_DESIGN_VERSION_SCHEMA
      && payload.schemaVersion !== PROJECT_DESIGN_VERSION_SCHEMA
    )
    || ("sourceType" in payload && payload.sourceType !== undefined && payload.sourceType !== "figma")
    || !payload.file
    || typeof payload.file.key !== "string"
    || !Array.isArray(payload.screens)
  ) {
    throw new Error("Unsupported project design version payload.");
  }
  return payload;
}

export function parseProjectDesignVersion(payloadJson: string): ProjectDesignVersionPayload {
  const payload = parseAnyProjectDesignVersion(payloadJson);
  if (isVideoDesignVersionPayload(payload)) {
    throw new Error("Expected a Figma project design version payload.");
  }
  return payload;
}
