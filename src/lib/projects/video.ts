import "server-only";

import { randomUUID } from "node:crypto";

import { and, asc, desc, eq, inArray, isNull, lt, or, sql } from "drizzle-orm";

import { db } from "@/db";
import {
  designVersionExplanations,
  projectDesigns,
  projectDesignVersions,
  projectVideoUploadSessions,
  revisionDesignVersions,
} from "@/db/schema";
import { assertStorageAllowance } from "@/lib/rooms/entitlements";
import { queueBlobDeletion } from "@/lib/rooms/service";
import {
  deleteAssetBytes,
  getStorageAdapter,
  verifyPrivateVideoObject,
} from "@/lib/rooms/storage";
import {
  PROJECT_DESIGN_VERSION_SCHEMA,
  isVideoDesignVersionPayload,
  parseAnyProjectDesignVersion,
  serializeAnyProjectDesignVersion,
  type VideoDesignVersionPayload,
} from "@/lib/projects/design-version";
import type { WorkspaceScope } from "@/lib/tenant/context";

export const VIDEO_MIME_TYPES = ["video/mp4", "video/webm"] as const;
export type VideoMimeType = (typeof VIDEO_MIME_TYPES)[number];

export const MAX_VIDEO_UPLOAD_BYTES = (() => {
  const configured = Number(process.env.MAX_VIDEO_UPLOAD_BYTES);
  return Number.isSafeInteger(configured) && configured > 0
    ? configured
    : 500 * 1024 * 1024;
})();

const SHA256_PATTERN = /^[0-9a-f]{64}$/;

function safeFilename(value: string) {
  return value.trim().replace(/[/\\]/g, "-").slice(0, 200) || "video";
}

export function buildProjectVideoObjectPath(input: {
  workspaceId: string;
  projectId: string;
  filename: string;
}) {
  const filename = safeFilename(input.filename).replace(/[^a-zA-Z0-9._-]+/g, "-");
  return `workspaces/${input.workspaceId}/projects/${input.projectId}/videos/${randomUUID()}-${filename}`;
}

export function assertProjectVideoPath(pathname: string, workspaceId: string, projectId: string) {
  const prefix = `workspaces/${workspaceId}/projects/${projectId}/videos/`;
  if (!pathname.startsWith(prefix) || pathname.includes("..") || pathname.includes("\\")) {
    throw new Error("Upload path is not owned by this project.");
  }
}

export type VideoMetadataInput = {
  originalFilename: string;
  mimeType: string;
  byteSize: number;
  durationMs: number;
  width?: number | null;
  height?: number | null;
  checksum: string;
};

export function validateVideoMetadata(input: VideoMetadataInput) {
  const mimeType = input.mimeType.toLowerCase();
  if (!(VIDEO_MIME_TYPES as readonly string[]).includes(mimeType)) {
    throw new Error("Only MP4 and WebM videos are supported.");
  }
  if (!Number.isSafeInteger(input.byteSize) || input.byteSize <= 0 || input.byteSize > MAX_VIDEO_UPLOAD_BYTES) {
    throw new Error(`Videos must be between 1 byte and ${MAX_VIDEO_UPLOAD_BYTES} bytes.`);
  }
  if (!Number.isSafeInteger(input.durationMs) || input.durationMs <= 0 || input.durationMs > 24 * 60 * 60 * 1000) {
    throw new Error("Video duration must be between 1 millisecond and 24 hours.");
  }
  const dimension = (value: number | null | undefined, label: string) => {
    if (value === null || value === undefined) return null;
    if (!Number.isSafeInteger(value) || value <= 0 || value > 32768) {
      throw new Error(`${label} must be a positive integer no larger than 32768.`);
    }
    return value;
  };
  const width = dimension(input.width, "Video width");
  const height = dimension(input.height, "Video height");
  if ((width === null) !== (height === null)) {
    throw new Error("Video width and height must be provided together.");
  }
  const checksum = input.checksum.toLowerCase();
  if (!SHA256_PATTERN.test(checksum)) throw new Error("A valid SHA-256 checksum is required.");
  return {
    originalFilename: safeFilename(input.originalFilename),
    mimeType: mimeType as VideoMimeType,
    byteSize: input.byteSize,
    durationMs: input.durationMs,
    width,
    height,
    checksum,
  };
}

function toVideoSummary(
  design: typeof projectDesigns.$inferSelect,
  version: typeof projectDesignVersions.$inferSelect,
) {
  const payload = parseAnyProjectDesignVersion(version.payloadJson);
  if (!isVideoDesignVersionPayload(payload)) throw new Error("Expected an immutable video version.");
  return {
    designId: design.id,
    designName: design.name,
    designVersionId: version.id,
    versionNumber: version.versionNumber,
    contentSha256: version.contentSha256,
    isCurrent: design.currentVersionId === version.id,
    ...payload.video,
  };
}

export async function listProjectVideos(scope: WorkspaceScope, projectId: string) {
  const rows = await db
    .select({ design: projectDesigns, version: projectDesignVersions })
    .from(projectDesigns)
    .innerJoin(projectDesignVersions, eq(projectDesignVersions.id, projectDesigns.currentVersionId))
    .where(and(
      eq(projectDesigns.organizationId, scope.organizationId),
      eq(projectDesigns.workspaceId, scope.workspaceId),
      eq(projectDesigns.projectId, projectId),
      eq(projectDesigns.sourceType, "video"),
    ))
    .orderBy(desc(projectDesigns.updatedAt));
  return rows.map(({ design, version }) => toVideoSummary(design, version));
}

export async function listVideoVersions(scope: WorkspaceScope, projectId: string, designId: string) {
  const design = (await db.select().from(projectDesigns).where(and(
    eq(projectDesigns.id, designId),
    eq(projectDesigns.projectId, projectId),
    eq(projectDesigns.organizationId, scope.organizationId),
    eq(projectDesigns.workspaceId, scope.workspaceId),
    eq(projectDesigns.sourceType, "video"),
  )).limit(1))[0];
  if (!design) throw new Error("Video design not found.");
  const versions = await db.select().from(projectDesignVersions)
    .where(and(
      eq(projectDesignVersions.designId, design.id),
      eq(projectDesignVersions.organizationId, scope.organizationId),
      eq(projectDesignVersions.workspaceId, scope.workspaceId),
      eq(projectDesignVersions.projectId, projectId),
    ))
    .orderBy(desc(projectDesignVersions.versionNumber));
  const references = versions.length
    ? await db.select({ designVersionId: revisionDesignVersions.designVersionId })
      .from(revisionDesignVersions)
      .where(inArray(revisionDesignVersions.designVersionId, versions.map((version) => version.id)))
    : [];
  const referenced = new Set(references.map((row) => row.designVersionId));
  return versions.map((version) => ({
    ...toVideoSummary(design, version),
    isReferenced: referenced.has(version.id),
    canDelete: design.currentVersionId !== version.id && !referenced.has(version.id),
    createdAt: version.createdAt,
  }));
}

type VerifiedVideoObject = Awaited<ReturnType<typeof verifyPrivateVideoObject>>;

async function persistProjectVideoVersion(input: {
  scope: WorkspaceScope;
  projectId: string;
  designId?: string | null;
  designName?: string | null;
  pathname: string;
  metadata: VideoMetadataInput;
  verified: VerifiedVideoObject;
  uploadedAt?: Date;
}) {
  const metadata = validateVideoMetadata(input.metadata);
  assertProjectVideoPath(input.pathname, input.scope.workspaceId, input.projectId);
  const verifiedChecksum = input.verified.sha256;

  const result = await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`video:${input.projectId}:${input.designId || verifiedChecksum}`}))`);

    if (input.designId) {
      const design = (await tx.select().from(projectDesigns).where(and(
        eq(projectDesigns.id, input.designId),
        eq(projectDesigns.projectId, input.projectId),
        eq(projectDesigns.organizationId, input.scope.organizationId),
        eq(projectDesigns.workspaceId, input.scope.workspaceId),
        eq(projectDesigns.sourceType, "video"),
      )).limit(1))[0];
      if (!design) throw new Error("Video design not found in this project.");
    }

    const existingRows = await tx
      .select({ design: projectDesigns, version: projectDesignVersions })
      .from(projectDesignVersions)
      .innerJoin(projectDesigns, eq(projectDesigns.id, projectDesignVersions.designId))
      .where(and(
        eq(projectDesignVersions.projectId, input.projectId),
        eq(projectDesignVersions.organizationId, input.scope.organizationId),
        eq(projectDesignVersions.workspaceId, input.scope.workspaceId),
        eq(projectDesignVersions.contentSha256, verifiedChecksum),
        eq(projectDesigns.sourceType, "video"),
        ...(input.designId ? [eq(projectDesignVersions.designId, input.designId)] : []),
      ))
      .limit(1);
    const existing = existingRows[0];
    if (existing) {
      return { ...toVideoSummary(existing.design, existing.version), idempotent: true as const };
    }

    let design = input.designId
      ? (await tx.select().from(projectDesigns).where(and(
        eq(projectDesigns.id, input.designId),
        eq(projectDesigns.organizationId, input.scope.organizationId),
        eq(projectDesigns.workspaceId, input.scope.workspaceId),
        eq(projectDesigns.projectId, input.projectId),
      )).limit(1))[0]
      : null;
    if (!design) {
      [design] = await tx.insert(projectDesigns).values({
        organizationId: input.scope.organizationId,
        workspaceId: input.scope.workspaceId,
        projectId: input.projectId,
        sourceType: "video",
        sourceKey: randomUUID(),
        name: input.designName?.trim().slice(0, 200)
          || metadata.originalFilename.replace(/\.[^.]+$/, "")
          || "Video",
      }).returning();
    }

    const current = await tx.select({ max: sql<number>`coalesce(max(${projectDesignVersions.versionNumber}), 0)` })
      .from(projectDesignVersions)
      .where(and(
        eq(projectDesignVersions.designId, design.id),
        eq(projectDesignVersions.organizationId, input.scope.organizationId),
        eq(projectDesignVersions.workspaceId, input.scope.workspaceId),
        eq(projectDesignVersions.projectId, input.projectId),
      ));
    const versionNumber = Number(current[0]?.max || 0) + 1;
    const versionId = randomUUID();
    const payload: VideoDesignVersionPayload = {
      schemaVersion: PROJECT_DESIGN_VERSION_SCHEMA,
      sourceType: "video",
      video: {
        originalFilename: metadata.originalFilename,
        mimeType: metadata.mimeType,
        byteSize: metadata.byteSize,
        durationMs: metadata.durationMs,
        width: metadata.width,
        height: metadata.height,
        objectKey: input.verified.pathname,
        storageProvider: getStorageAdapter().provider,
        blobUrl: null,
        sha256: verifiedChecksum,
        poster: null,
        uploadedAt: (input.uploadedAt ?? new Date()).toISOString(),
      },
    };
    const [version] = await tx.insert(projectDesignVersions).values({
      id: versionId,
      organizationId: input.scope.organizationId,
      workspaceId: input.scope.workspaceId,
      projectId: input.projectId,
      designId: design.id,
      versionNumber,
      contentSha256: verifiedChecksum,
      payloadJson: serializeAnyProjectDesignVersion(payload),
      createdByUserId: input.scope.userId,
    }).returning();
    await tx.update(projectDesigns).set({
      currentVersionId: version.id,
      updatedAt: new Date(),
    }).where(and(
      eq(projectDesigns.id, design.id),
      eq(projectDesigns.organizationId, input.scope.organizationId),
      eq(projectDesigns.workspaceId, input.scope.workspaceId),
      eq(projectDesigns.projectId, input.projectId),
    ));
    return { ...toVideoSummary({ ...design, currentVersionId: version.id }, version), idempotent: false as const };
  });

  if (result.idempotent && result.objectKey !== input.verified.pathname) {
    await queueBlobDeletion({
      workspaceId: input.scope.workspaceId,
      objectKey: input.verified.pathname,
      blobUrl: null,
      reason: "duplicate_video_upload",
    }).catch(() => undefined);
  }
  return result;
}

export async function completeProjectVideoUpload(input: {
  scope: WorkspaceScope;
  projectId: string;
  designId?: string | null;
  designName?: string | null;
  pathname: string;
  blobUrl?: string | null;
  metadata: VideoMetadataInput;
  uploadedAt?: Date;
}) {
  const metadata = validateVideoMetadata(input.metadata);
  assertProjectVideoPath(input.pathname, input.scope.workspaceId, input.projectId);
  await assertStorageAllowance(input.scope.organizationId, input.scope.workspaceId, metadata.byteSize);
  try {
    const verified = await verifyPrivateVideoObject({
      pathname: input.pathname,
      expectedContentType: metadata.mimeType,
      expectedSize: metadata.byteSize,
      expectedSha256: metadata.checksum,
    });
    return await persistProjectVideoVersion({ ...input, metadata, verified });
  } catch (error) {
    await queueBlobDeletion({
      workspaceId: input.scope.workspaceId,
      objectKey: input.pathname,
      blobUrl: null,
      reason: "rejected_video_upload",
      flush: false,
    }).catch(() => undefined);
    throw error;
  }
}

export async function prepareProjectVideoUpload(input: {
  scope: WorkspaceScope;
  projectId: string;
  designId?: string | null;
  designName?: string | null;
  metadata: VideoMetadataInput;
}) {
  const metadata = validateVideoMetadata(input.metadata);
  await assertStorageAllowance(input.scope.organizationId, input.scope.workspaceId, metadata.byteSize);
  if (input.designId) {
    const design = (await db.select({ id: projectDesigns.id }).from(projectDesigns).where(and(
      eq(projectDesigns.id, input.designId),
      eq(projectDesigns.organizationId, input.scope.organizationId),
      eq(projectDesigns.workspaceId, input.scope.workspaceId),
      eq(projectDesigns.projectId, input.projectId),
      eq(projectDesigns.sourceType, "video"),
    )).limit(1))[0];
    if (!design) throw new Error("Video design not found in this project.");
  }
  const uploadSessionId = randomUUID();
  const pathname = buildProjectVideoObjectPath({
    workspaceId: input.scope.workspaceId,
    projectId: input.projectId,
    filename: metadata.originalFilename,
  });
  const [session] = await db.insert(projectVideoUploadSessions).values({
    id: uploadSessionId,
    organizationId: input.scope.organizationId,
    workspaceId: input.scope.workspaceId,
    projectId: input.projectId,
    existingDesignId: input.designId ?? null,
    createdByUserId: input.scope.userId,
    pathname,
    originalFilename: metadata.originalFilename,
    designName: input.designName?.trim().slice(0, 200) || null,
    mimeType: metadata.mimeType,
    byteSize: metadata.byteSize,
    durationMs: metadata.durationMs,
    width: metadata.width,
    height: metadata.height,
    declaredSha256: metadata.checksum,
    status: "pending",
  }).returning();
  await queueBlobDeletion({
    workspaceId: input.scope.workspaceId,
    objectKey: pathname,
    reason: "abandoned_video_upload",
    availableAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    flush: false,
  });
  return session;
}

async function completedVideoForSession(
  scope: WorkspaceScope,
  projectId: string,
  session: typeof projectVideoUploadSessions.$inferSelect,
) {
  if (!session.resultDesignId || !session.resultDesignVersionId) {
    throw new Error("Completed upload session is missing its video result.");
  }
  const result = (await db.select({ design: projectDesigns, version: projectDesignVersions })
    .from(projectDesignVersions)
    .innerJoin(projectDesigns, eq(projectDesigns.id, projectDesignVersions.designId))
    .where(and(
      eq(projectDesignVersions.id, session.resultDesignVersionId),
      eq(projectDesignVersions.designId, session.resultDesignId),
      eq(projectDesignVersions.organizationId, scope.organizationId),
      eq(projectDesignVersions.workspaceId, scope.workspaceId),
      eq(projectDesignVersions.projectId, projectId),
    )).limit(1))[0];
  if (!result) throw new Error("Completed video result was not found.");
  return toVideoSummary(result.design, result.version);
}

async function findProjectVideoUploadSession(
  scope: WorkspaceScope,
  projectId: string,
  uploadSessionId: string,
) {
  return (await db.select().from(projectVideoUploadSessions).where(and(
    eq(projectVideoUploadSessions.id, uploadSessionId),
    eq(projectVideoUploadSessions.organizationId, scope.organizationId),
    eq(projectVideoUploadSessions.workspaceId, scope.workspaceId),
    eq(projectVideoUploadSessions.projectId, projectId),
  )).limit(1))[0] ?? null;
}

export async function getProjectVideoUploadStatus(
  scope: WorkspaceScope,
  projectId: string,
  uploadSessionId: string,
) {
  const session = await findProjectVideoUploadSession(scope, projectId, uploadSessionId);
  if (!session) throw new Error("Video upload session not found.");
  if (session.status === "completed") {
    return {
      uploadSessionId: session.id,
      status: "completed" as const,
      designId: session.resultDesignId,
      designVersionId: session.resultDesignVersionId,
      video: await completedVideoForSession(scope, projectId, session),
    };
  }
  if (session.status === "failed") {
    return {
      uploadSessionId: session.id,
      status: "failed" as const,
      error: session.errorMessage || "Video completion failed.",
    };
  }
  return { uploadSessionId: session.id, status: "pending" as const };
}

function safeVideoCompletionError(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  if (/checksum mismatch/i.test(message)) {
    return { code: "checksum_mismatch", message: "Video checksum mismatch." };
  }
  if (/size mismatch/i.test(message)) {
    return { code: "size_mismatch", message: "Uploaded video size did not match the prepared upload." };
  }
  if (/content type mismatch/i.test(message)) {
    return { code: "mime_mismatch", message: "Uploaded video type did not match the prepared upload." };
  }
  if (/not found/i.test(message)) {
    return { code: "object_not_found", message: "Uploaded video was not found in private storage." };
  }
  if (/storage|quota|allowance|limit/i.test(message)) {
    return { code: "storage_limit", message: "Video completion exceeded the workspace storage allowance." };
  }
  return { code: "completion_failed", message: "Video completion failed during server verification." };
}

export async function completeProjectVideoUploadSession(input: {
  scope: WorkspaceScope;
  projectId: string;
  uploadSessionId: string;
  pathname: string;
  declaredSha256: string;
}) {
  const session = await findProjectVideoUploadSession(input.scope, input.projectId, input.uploadSessionId);
  if (!session) throw new Error("Video upload session not found.");
  if (session.pathname !== input.pathname || session.declaredSha256 !== input.declaredSha256.toLowerCase()) {
    throw new Error("Invalid video upload completion payload.");
  }
  if (session.status !== "pending") {
    return getProjectVideoUploadStatus(input.scope, input.projectId, input.uploadSessionId);
  }

  const attemptId = randomUUID();
  const staleBefore = new Date(Date.now() - 5 * 60 * 1000);
  const [claimed] = await db.update(projectVideoUploadSessions).set({
    completionAttemptId: attemptId,
    completionStartedAt: new Date(),
    updatedAt: new Date(),
  }).where(and(
    eq(projectVideoUploadSessions.id, session.id),
    eq(projectVideoUploadSessions.organizationId, input.scope.organizationId),
    eq(projectVideoUploadSessions.workspaceId, input.scope.workspaceId),
    eq(projectVideoUploadSessions.projectId, input.projectId),
    eq(projectVideoUploadSessions.status, "pending"),
    or(
      isNull(projectVideoUploadSessions.completionStartedAt),
      lt(projectVideoUploadSessions.completionStartedAt, staleBefore),
    ),
  )).returning();
  if (!claimed) {
    return getProjectVideoUploadStatus(input.scope, input.projectId, input.uploadSessionId);
  }

  const metadata = validateVideoMetadata({
    originalFilename: claimed.originalFilename,
    mimeType: claimed.mimeType,
    byteSize: claimed.byteSize,
    durationMs: claimed.durationMs,
    width: claimed.width,
    height: claimed.height,
    checksum: claimed.declaredSha256,
  });
  let video: Awaited<ReturnType<typeof persistProjectVideoVersion>>;
  try {
    await assertStorageAllowance(input.scope.organizationId, input.scope.workspaceId, metadata.byteSize);
    const verified = await verifyPrivateVideoObject({
      pathname: claimed.pathname,
      expectedContentType: metadata.mimeType,
      expectedSize: metadata.byteSize,
      expectedSha256: claimed.declaredSha256,
    });
    video = await persistProjectVideoVersion({
      scope: input.scope,
      projectId: input.projectId,
      designId: claimed.existingDesignId,
      designName: claimed.designName,
      pathname: claimed.pathname,
      metadata: { ...metadata, checksum: verified.sha256 },
      verified,
    });
  } catch (error) {
    const failure = safeVideoCompletionError(error);
    await db.update(projectVideoUploadSessions).set({
      status: "failed",
      errorCode: failure.code,
      errorMessage: failure.message,
      completedAt: new Date(),
      updatedAt: new Date(),
    }).where(and(
      eq(projectVideoUploadSessions.id, claimed.id),
      eq(projectVideoUploadSessions.organizationId, input.scope.organizationId),
      eq(projectVideoUploadSessions.workspaceId, input.scope.workspaceId),
      eq(projectVideoUploadSessions.projectId, input.projectId),
      eq(projectVideoUploadSessions.status, "pending"),
      eq(projectVideoUploadSessions.completionAttemptId, attemptId),
    ));
    await queueBlobDeletion({
      workspaceId: claimed.workspaceId,
      objectKey: claimed.pathname,
      blobUrl: null,
      reason: "rejected_video_upload",
      flush: false,
    }).catch(() => undefined);
    throw error;
  }

  const [completed] = await db.update(projectVideoUploadSessions).set({
    status: "completed",
    resultDesignId: video.designId,
    resultDesignVersionId: video.designVersionId,
    errorCode: null,
    errorMessage: null,
    completedAt: new Date(),
    updatedAt: new Date(),
  }).where(and(
    eq(projectVideoUploadSessions.id, claimed.id),
    eq(projectVideoUploadSessions.organizationId, input.scope.organizationId),
    eq(projectVideoUploadSessions.workspaceId, input.scope.workspaceId),
    eq(projectVideoUploadSessions.projectId, input.projectId),
    eq(projectVideoUploadSessions.status, "pending"),
    eq(projectVideoUploadSessions.completionAttemptId, attemptId),
  )).returning();
  if (!completed) {
    return getProjectVideoUploadStatus(input.scope, input.projectId, input.uploadSessionId);
  }
  return {
    uploadSessionId: completed.id,
    status: "completed" as const,
    designId: video.designId,
    designVersionId: video.designVersionId,
    video,
  };
}

export async function deleteVideoVersion(
  scope: WorkspaceScope,
  projectId: string,
  designId: string,
  designVersionId: string,
) {
  await db.transaction(async (tx) => {
    const row = (await tx
      .select({ design: projectDesigns, version: projectDesignVersions })
      .from(projectDesignVersions)
      .innerJoin(projectDesigns, eq(projectDesigns.id, projectDesignVersions.designId))
      .where(and(
        eq(projectDesignVersions.id, designVersionId),
        eq(projectDesignVersions.designId, designId),
        eq(projectDesignVersions.projectId, projectId),
        eq(projectDesignVersions.organizationId, scope.organizationId),
        eq(projectDesignVersions.workspaceId, scope.workspaceId),
        eq(projectDesigns.organizationId, scope.organizationId),
        eq(projectDesigns.workspaceId, scope.workspaceId),
        eq(projectDesigns.projectId, projectId),
        eq(projectDesigns.sourceType, "video"),
      ))
      .limit(1))[0];
    if (!row) throw new Error("Video version not found.");
    if (row.design.currentVersionId === row.version.id) throw new Error("The current video version cannot be deleted.");
    const referenced = (await tx.select({ id: revisionDesignVersions.id })
      .from(revisionDesignVersions)
      .where(eq(revisionDesignVersions.designVersionId, row.version.id))
      .limit(1))[0];
    if (referenced) throw new Error("A video version used by an approval room cannot be deleted.");
    const payload = parseAnyProjectDesignVersion(row.version.payloadJson);
    if (!isVideoDesignVersionPayload(payload)) throw new Error("Video version not found.");
    await tx.delete(projectDesignVersions).where(and(
      eq(projectDesignVersions.id, row.version.id),
      eq(projectDesignVersions.organizationId, scope.organizationId),
      eq(projectDesignVersions.workspaceId, scope.workspaceId),
      eq(projectDesignVersions.projectId, projectId),
    ));
  });
  return { deleted: true, id: designVersionId };
}

function cleanText(value: string, max: number, label: string) {
  const clean = value.trim().slice(0, max);
  if (!clean) throw new Error(`${label} is required.`);
  return clean;
}

export type VideoExplanationRecord = {
  id: string;
  videoTimeMs: number;
  category: string;
  title: string;
  body: string;
  status: "draft" | "published";
  canEdit: boolean;
  canMoveToDraft: boolean;
  createdAt: string;
  updatedAt: string;
};

export function serializeVideoExplanation(
  row: typeof designVersionExplanations.$inferSelect,
  currentUserId: string,
): VideoExplanationRecord {
  return {
    id: row.id,
    videoTimeMs: row.videoTimeMs,
    category: row.category,
    title: row.title,
    body: row.body,
    status: row.status === "published" ? "published" : "draft",
    canEdit: row.status === "draft" && row.authorUserId === currentUserId,
    canMoveToDraft: row.status === "published" && row.authorUserId === currentUserId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

async function videoVersionForScope(
  scope: WorkspaceScope,
  projectId: string,
  designId: string,
  designVersionId: string,
) {
  const row = (await db.select().from(projectDesignVersions).where(and(
    eq(projectDesignVersions.id, designVersionId),
    eq(projectDesignVersions.designId, designId),
    eq(projectDesignVersions.projectId, projectId),
    eq(projectDesignVersions.organizationId, scope.organizationId),
    eq(projectDesignVersions.workspaceId, scope.workspaceId),
  )).limit(1))[0];
  if (!row) throw new Error("Video version not found.");
  const payload = parseAnyProjectDesignVersion(row.payloadJson);
  if (!isVideoDesignVersionPayload(payload)) throw new Error("Explanation target must be a video version.");
  return { row, payload };
}

export async function listVideoExplanations(
  scope: WorkspaceScope,
  projectId: string,
  designId: string,
  designVersionId: string,
) {
  await videoVersionForScope(scope, projectId, designId, designVersionId);
  const rows = await db.select().from(designVersionExplanations).where(and(
    eq(designVersionExplanations.organizationId, scope.organizationId),
    eq(designVersionExplanations.designVersionId, designVersionId),
    eq(designVersionExplanations.projectId, projectId),
    eq(designVersionExplanations.workspaceId, scope.workspaceId),
  )).orderBy(asc(designVersionExplanations.videoTimeMs), asc(designVersionExplanations.createdAt));
  return rows.map((row) => serializeVideoExplanation(row, scope.userId));
}

export async function createVideoExplanation(input: {
  scope: WorkspaceScope;
  projectId: string;
  designId: string;
  designVersionId: string;
  videoTimeMs: number;
  category: string;
  title: string;
  body: string;
}) {
  const { payload } = await videoVersionForScope(
    input.scope,
    input.projectId,
    input.designId,
    input.designVersionId,
  );
  if (!Number.isSafeInteger(input.videoTimeMs) || input.videoTimeMs < 0 || input.videoTimeMs > payload.video.durationMs) {
    throw new Error("Explanation timestamp is outside the video duration.");
  }
  const [created] = await db.insert(designVersionExplanations).values({
    organizationId: input.scope.organizationId,
    workspaceId: input.scope.workspaceId,
    projectId: input.projectId,
    designId: input.designId,
    designVersionId: input.designVersionId,
    authorUserId: input.scope.userId,
    authorDisplayName: input.scope.userName || input.scope.userEmail || "Designer",
    targetType: "video",
    videoTimeMs: input.videoTimeMs,
    category: cleanText(input.category, 80, "Category"),
    title: cleanText(input.title, 200, "Title"),
    body: cleanText(input.body, 5000, "Explanation"),
    status: "draft",
  }).returning();
  return serializeVideoExplanation(created, input.scope.userId);
}

export async function updateVideoExplanation(input: {
  scope: WorkspaceScope;
  projectId: string;
  explanationId: string;
  category?: string;
  title?: string;
  body?: string;
  videoTimeMs?: number;
  publish?: boolean;
  status?: "draft" | "published";
}) {
  const existing = (await db.select().from(designVersionExplanations).where(and(
    eq(designVersionExplanations.id, input.explanationId),
    eq(designVersionExplanations.organizationId, input.scope.organizationId),
    eq(designVersionExplanations.workspaceId, input.scope.workspaceId),
    eq(designVersionExplanations.projectId, input.projectId),
  )).limit(1))[0];
  if (!existing) throw new Error("Explanation not found.");
  const requestedStatus = input.status ?? (input.publish ? "published" : undefined);
  const changesContent = input.category !== undefined
    || input.title !== undefined
    || input.body !== undefined
    || input.videoTimeMs !== undefined;
  if (existing.authorUserId !== input.scope.userId) throw new Error("Only the author can change this explanation.");
  if (existing.status === "published" && (requestedStatus !== "draft" || changesContent)) {
    throw new Error("Published explanations are immutable. Move this explanation to draft before editing it.");
  }
  if (input.videoTimeMs !== undefined) {
    const { payload } = await videoVersionForScope(
      input.scope,
      existing.projectId,
      existing.designId,
      existing.designVersionId,
    );
    if (!Number.isSafeInteger(input.videoTimeMs) || input.videoTimeMs < 0 || input.videoTimeMs > payload.video.durationMs) {
      throw new Error("Explanation timestamp is outside the video duration.");
    }
  }
  const [updated] = await db.update(designVersionExplanations).set({
    ...(input.category !== undefined ? { category: cleanText(input.category, 80, "Category") } : {}),
    ...(input.title !== undefined ? { title: cleanText(input.title, 200, "Title") } : {}),
    ...(input.body !== undefined ? { body: cleanText(input.body, 5000, "Explanation") } : {}),
    ...(input.videoTimeMs !== undefined ? { videoTimeMs: input.videoTimeMs } : {}),
    ...(requestedStatus ? { status: requestedStatus } : {}),
    updatedAt: new Date(),
  }).where(and(
    eq(designVersionExplanations.id, existing.id),
    eq(designVersionExplanations.organizationId, input.scope.organizationId),
    eq(designVersionExplanations.workspaceId, input.scope.workspaceId),
    eq(designVersionExplanations.projectId, input.projectId),
    eq(designVersionExplanations.authorUserId, input.scope.userId),
    eq(designVersionExplanations.status, existing.status),
  )).returning();
  if (!updated) throw new Error("The explanation changed while you were editing it. Refresh and try again.");
  return serializeVideoExplanation(updated, input.scope.userId);
}

export async function copyVideoExplanations(input: {
  scope: WorkspaceScope;
  projectId: string;
  designId: string;
  sourceDesignVersionId: string;
  targetDesignVersionId: string;
}) {
  await Promise.all([
    videoVersionForScope(input.scope, input.projectId, input.designId, input.sourceDesignVersionId),
    videoVersionForScope(input.scope, input.projectId, input.designId, input.targetDesignVersionId),
  ]);
  const source = await db.select().from(designVersionExplanations).where(and(
    eq(designVersionExplanations.organizationId, input.scope.organizationId),
    eq(designVersionExplanations.workspaceId, input.scope.workspaceId),
    eq(designVersionExplanations.projectId, input.projectId),
    eq(designVersionExplanations.designId, input.designId),
    eq(designVersionExplanations.designVersionId, input.sourceDesignVersionId),
  )).orderBy(asc(designVersionExplanations.videoTimeMs));
  const copyable = source.filter(
    (note) => note.status === "published" || note.authorUserId === input.scope.userId,
  );
  if (!copyable.length) return [];
  const copies = await db.insert(designVersionExplanations).values(copyable.map((note) => ({
    organizationId: input.scope.organizationId,
    workspaceId: input.scope.workspaceId,
    projectId: input.projectId,
    designId: input.designId,
    designVersionId: input.targetDesignVersionId,
    authorUserId: input.scope.userId,
    authorDisplayName: input.scope.userName || input.scope.userEmail || "Designer",
    targetType: "video",
    videoTimeMs: note.videoTimeMs,
    category: note.category,
    title: note.title,
    body: note.body,
    status: "draft",
  }))).returning();
  return copies.map((row) => serializeVideoExplanation(row, input.scope.userId));
}

export async function deleteUnstoredVideoObject(pathname: string) {
  await deleteAssetBytes(pathname);
}
