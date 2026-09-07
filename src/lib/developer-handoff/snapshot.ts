import { createHash } from "node:crypto";

export const DEVELOPER_HANDOFF_SNAPSHOT_SCHEMA_VERSION = 1 as const;

export type DeveloperHandoffExplanationSnapshot = {
  id: string;
  authorDisplayName: string;
  figmaNodeId: string | null;
  figmaNodeName: string | null;
  xBasisPoints: number;
  yBasisPoints: number;
  category: string;
  title: string;
  body: string;
  publishedAt: string;
};

export type DeveloperHandoffScreenSnapshot = {
  id: string;
  name: string;
  type: string;
  width: number | null;
  height: number | null;
  x: number | null;
  y: number | null;
  sortOrder: number;
  breakpointGroupId: string | null;
  preview: {
    mediaId: string;
    contentType: string;
    bytes: number;
    sha256: string;
  } | null;
  explanations: DeveloperHandoffExplanationSnapshot[];
};

export type DeveloperHandoffFileSnapshot = {
  key: string;
  name: string;
  figmaVersion: string;
  figmaLastModified: string;
  mainScreenId: string | null;
  breakpointGroups: Array<{
    id: string;
    name: string;
    primaryScreenId: string;
    memberScreenIds: string[];
  }>;
  screens: DeveloperHandoffScreenSnapshot[];
  interactions: Array<{
    id: string;
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
};

export type DeveloperHandoffSnapshotDto = {
  schemaVersion: typeof DEVELOPER_HANDOFF_SNAPSHOT_SCHEMA_VERSION;
  snapshotId: string;
  version: number;
  project: {
    id: string;
    name: string;
    clientName: string;
  };
  approvedRevision: {
    id: string;
    number: number;
    contentDigest: string;
    approvalId: string;
    approvedAt: string;
    approverDisplayName: string;
  } | null;
  publishedByDisplayName: string;
  publishedAt: string;
  file: DeveloperHandoffFileSnapshot;
};

function canonicalize(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "string" || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError("Canonical JSON does not allow non-finite numbers.");
    return JSON.stringify(Object.is(value, -0) ? 0 : value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record).sort();
    return `{${keys.map((key) => {
      if (record[key] === undefined) {
        throw new TypeError("Canonical JSON does not allow undefined values.");
      }
      return `${JSON.stringify(key)}:${canonicalize(record[key])}`;
    }).join(",")}}`;
  }
  throw new TypeError(`Canonical JSON does not allow ${typeof value} values.`);
}

/** Stable JSON independent of object insertion order. Arrays retain semantic order. */
export function canonicalSnapshotJson(snapshot: DeveloperHandoffSnapshotDto): string {
  return canonicalize(snapshot);
}

export function snapshotSha256(snapshot: DeveloperHandoffSnapshotDto): string {
  return createHash("sha256").update(canonicalSnapshotJson(snapshot), "utf8").digest("hex");
}

export function parseDeveloperHandoffSnapshot(payloadJson: string): DeveloperHandoffSnapshotDto {
  const parsed = JSON.parse(payloadJson) as DeveloperHandoffSnapshotDto;
  if (
    !parsed ||
    parsed.schemaVersion !== DEVELOPER_HANDOFF_SNAPSHOT_SCHEMA_VERSION ||
    typeof parsed.snapshotId !== "string" ||
    typeof parsed.version !== "number" ||
    !parsed.file ||
    typeof parsed.file.key !== "string"
  ) {
    throw new Error("Unsupported developer handoff snapshot.");
  }
  return parsed;
}

/** Replace internal media handles with token-authorized URLs for public delivery. */
export function publicDeveloperHandoffSnapshot(
  token: string,
  snapshot: DeveloperHandoffSnapshotDto,
) {
  return {
    version: snapshot.version,
    project: {
      name: snapshot.project.name,
      clientName: snapshot.project.clientName,
    },
    approvedRevision: snapshot.approvedRevision
      ? {
          number: snapshot.approvedRevision.number,
          approvedAt: snapshot.approvedRevision.approvedAt,
          approverDisplayName: snapshot.approvedRevision.approverDisplayName,
        }
      : null,
    publishedByDisplayName: snapshot.publishedByDisplayName,
    publishedAt: snapshot.publishedAt,
    file: {
      key: snapshot.file.key,
      name: snapshot.file.name,
      figmaVersion: snapshot.file.figmaVersion,
      figmaLastModified: snapshot.file.figmaLastModified,
      mainScreenId: snapshot.file.mainScreenId,
      breakpointGroups: snapshot.file.breakpointGroups,
      interactions: snapshot.file.interactions,
      screens: snapshot.file.screens.map((screen) => ({
        id: screen.id,
        name: screen.name,
        type: screen.type,
        width: screen.width,
        height: screen.height,
        x: screen.x,
        y: screen.y,
        sortOrder: screen.sortOrder,
        breakpointGroupId: screen.breakpointGroupId,
        explanations: screen.explanations,
        preview: screen.preview
          ? {
              url: `/api/developer-handoff/${encodeURIComponent(token)}/screens/${encodeURIComponent(screen.preview.mediaId)}`,
              contentType: screen.preview.contentType,
              bytes: screen.preview.bytes,
              sha256: screen.preview.sha256,
            }
          : null,
      })),
    },
  };
}
