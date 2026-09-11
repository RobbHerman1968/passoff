import { createHash } from "node:crypto";

import { handleUpload, type HandleUploadBody, generateClientTokenFromReadWriteToken } from "@vercel/blob/client";
import { NextResponse } from "next/server";

import {
  authzResponse,
  requireClientProjectMembership,
} from "@/lib/auth/authorization";
import {
  buildProjectVideoObjectPath,
  completeProjectVideoUpload,
  completeProjectVideoUploadSession,
  deleteUnstoredVideoObject,
  deleteVideoVersion,
  listProjectVideos,
  listVideoVersions,
  MAX_VIDEO_UPLOAD_BYTES,
  prepareProjectVideoUpload,
  validateVideoMetadata,
  VIDEO_MIME_TYPES,
  type VideoMetadataInput,
} from "@/lib/projects/video";
import { getStorageAdapter } from "@/lib/rooms/storage";
import type { WorkspaceScope } from "@/lib/tenant/context";
import { getSiteUrl } from "@/lib/site";

export const runtime = "nodejs";
export const maxDuration = 300;

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type VideoUploadTokenMeta = {
  organizationId: string;
  workspaceId: string;
  userId: string;
  projectId: string;
  uploadSessionId: string;
  pathname: string;
  declaredSha256: string;
};

function scopeFromToken(meta: VideoUploadTokenMeta): WorkspaceScope {
  return {
    organizationId: meta.organizationId,
    organizationName: "",
    workspaceId: meta.workspaceId,
    workspaceName: "",
    userId: meta.userId,
    userName: "",
    userEmail: "",
  };
}

function parseVideoUploadTokenMeta(raw: string | null | undefined): VideoUploadTokenMeta | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<VideoUploadTokenMeta>;
    if (
      !parsed
      || typeof parsed !== "object"
      || typeof parsed.organizationId !== "string"
      || typeof parsed.workspaceId !== "string"
      || typeof parsed.userId !== "string"
      || typeof parsed.projectId !== "string"
      || typeof parsed.uploadSessionId !== "string"
      || typeof parsed.pathname !== "string"
      || typeof parsed.declaredSha256 !== "string"
      || ![parsed.organizationId, parsed.workspaceId, parsed.userId, parsed.projectId, parsed.uploadSessionId]
        .every((value) => uuidPattern.test(value))
      || !/^[0-9a-f]{64}$/.test(parsed.declaredSha256)
    ) {
      return null;
    }
    return parsed as VideoUploadTokenMeta;
  } catch {
    return null;
  }
}

function isBlobCompletionBody(body: unknown): body is HandleUploadBody {
  return Boolean(body && typeof body === "object" && "type" in body
    && (body as { type?: string }).type === "blob.upload-completed");
}

function numberField(form: FormData, name: string) {
  const value = form.get(name);
  if (typeof value !== "string" || value.trim() === "") return undefined;
  return Number(value);
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: projectId } = await params;
    if (!uuidPattern.test(projectId)) {
      return NextResponse.json({ error: "Invalid project id." }, { status: 400 });
    }
    const { scope } = await requireClientProjectMembership(projectId);
    const designId = new URL(request.url).searchParams.get("designId");
    const videos = designId
      ? await listVideoVersions(scope, projectId, designId)
      : await listProjectVideos(scope, projectId);
    return NextResponse.json({ videos }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const authz = authzResponse(error);
    if (authz) return authz;
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to load videos." },
      { status: 400 },
    );
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  let localPath: string | null = null;
  try {
    const { id: projectId } = await params;
    if (!uuidPattern.test(projectId)) {
      return NextResponse.json({ error: "Invalid project id." }, { status: 400 });
    }

    if (request.headers.get("content-type")?.includes("multipart/form-data")) {
      if (process.env.NODE_ENV === "production" || process.env.VERCEL === "1" || process.env.BLOB_READ_WRITE_TOKEN) {
        return NextResponse.json({ error: "Use direct Blob upload for videos in this environment." }, { status: 409 });
      }
      const { scope } = await requireClientProjectMembership(projectId);
      const form = await request.formData();
      const file = form.get("video");
      if (!(file instanceof File)) {
        return NextResponse.json({ error: "A video file is required." }, { status: 400 });
      }
      const bytes = Buffer.from(await file.arrayBuffer());
      const checksum = createHash("sha256").update(bytes).digest("hex");
      const declaredChecksum = String(form.get("checksum") || "").toLowerCase();
      if (checksum !== declaredChecksum) {
        return NextResponse.json({ error: "Video checksum mismatch." }, { status: 400 });
      }
      const metadata: VideoMetadataInput = {
        originalFilename: file.name,
        mimeType: file.type,
        byteSize: file.size,
        durationMs: Number(numberField(form, "durationMs")),
        width: numberField(form, "width"),
        height: numberField(form, "height"),
        checksum,
      };
      validateVideoMetadata(metadata);
      const localUploadPath = buildProjectVideoObjectPath({
        workspaceId: scope.workspaceId,
        projectId,
        filename: file.name,
      });
      localPath = localUploadPath;
      await getStorageAdapter().put(localUploadPath, bytes, file.type);
      const result = await completeProjectVideoUpload({
        scope,
        projectId,
        designId: typeof form.get("designId") === "string" ? String(form.get("designId")) || null : null,
        designName: typeof form.get("designName") === "string" ? String(form.get("designName")) : null,
        pathname: localUploadPath,
        blobUrl: localUploadPath,
        metadata,
      });
      localPath = null;
      return NextResponse.json({ video: result }, { status: result.idempotent ? 200 : 201 });
    }

    const body = await request.json() as HandleUploadBody | {
      action?: unknown;
      designId?: unknown;
      designName?: unknown;
      fileName?: unknown;
      contentType?: unknown;
      size?: unknown;
      checksum?: unknown;
      durationMs?: unknown;
      width?: unknown;
      height?: unknown;
    };

    if (isBlobCompletionBody(body)) {
      if (!process.env.BLOB_READ_WRITE_TOKEN) {
        return NextResponse.json({ error: "Blob storage is not configured." }, { status: 503 });
      }
      const response = await handleUpload({
        body,
        request,
        token: process.env.BLOB_READ_WRITE_TOKEN,
        onBeforeGenerateToken: async () => {
          throw new Error("Token generation is not available on this callback path.");
        },
        onUploadCompleted: async ({ blob, tokenPayload }) => {
          const meta = parseVideoUploadTokenMeta(tokenPayload);
          if (!meta || meta.projectId !== projectId || blob.pathname !== meta.pathname) {
            throw new Error("Invalid video upload completion payload.");
          }
          await completeProjectVideoUploadSession({
            scope: scopeFromToken(meta),
            projectId,
            uploadSessionId: meta.uploadSessionId,
            pathname: meta.pathname,
            declaredSha256: meta.declaredSha256,
          });
        },
      });
      return NextResponse.json(response);
    }

    if (body.action !== "prepare") {
      return NextResponse.json({ error: "Unknown upload action." }, { status: 400 });
    }
    if (!process.env.BLOB_READ_WRITE_TOKEN) {
      return NextResponse.json(
        { error: "Direct Blob upload is unavailable locally.", fallback: "multipart" },
        { status: 501 },
      );
    }
    const { scope } = await requireClientProjectMembership(projectId);
    const metadata = validateVideoMetadata({
      originalFilename: typeof body.fileName === "string" ? body.fileName : "video",
      mimeType: typeof body.contentType === "string" ? body.contentType : "",
      byteSize: typeof body.size === "number" ? body.size : 0,
      durationMs: typeof body.durationMs === "number" ? body.durationMs : 0,
      width: typeof body.width === "number" ? body.width : null,
      height: typeof body.height === "number" ? body.height : null,
      checksum: typeof body.checksum === "string" ? body.checksum : "",
    });
    const designId = typeof body.designId === "string" && uuidPattern.test(body.designId)
      ? body.designId
      : null;
    const session = await prepareProjectVideoUpload({
      scope,
      projectId,
      designId,
      designName: typeof body.designName === "string" ? body.designName.slice(0, 200) : null,
      metadata,
    });
    const tokenPayload = JSON.stringify({
      organizationId: scope.organizationId,
      workspaceId: scope.workspaceId,
      userId: scope.userId,
      projectId,
      uploadSessionId: session.id,
      pathname: session.pathname,
      declaredSha256: session.declaredSha256,
    } satisfies VideoUploadTokenMeta);
    const clientToken = await generateClientTokenFromReadWriteToken({
      token: process.env.BLOB_READ_WRITE_TOKEN,
      pathname: session.pathname,
      allowedContentTypes: [metadata.mimeType],
      maximumSizeInBytes: Math.min(metadata.byteSize, MAX_VIDEO_UPLOAD_BYTES),
      addRandomSuffix: false,
      onUploadCompleted: {
        callbackUrl: `${getSiteUrl()}/api/client-projects/${projectId}/videos`,
        tokenPayload,
      },
    });
    return NextResponse.json({
      uploadSessionId: session.id,
      pathname: session.pathname,
      clientToken,
      allowedContentTypes: VIDEO_MIME_TYPES,
      maximumSizeInBytes: Math.min(metadata.byteSize, MAX_VIDEO_UPLOAD_BYTES),
    });
  } catch (error) {
    if (localPath) await deleteUnstoredVideoObject(localPath).catch(() => undefined);
    const authz = authzResponse(error);
    if (authz) return authz;
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Video upload failed." },
      { status: 400 },
    );
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: projectId } = await params;
    const query = new URL(request.url).searchParams;
    const designId = query.get("designId");
    const designVersionId = query.get("designVersionId");
    if (!uuidPattern.test(projectId) || !designId || !designVersionId
      || !uuidPattern.test(designId) || !uuidPattern.test(designVersionId)) {
      return NextResponse.json({ error: "Valid project, design, and version identifiers are required." }, { status: 400 });
    }
    const { scope } = await requireClientProjectMembership(projectId);
    return NextResponse.json(await deleteVideoVersion(scope, projectId, designId, designVersionId));
  } catch (error) {
    const authz = authzResponse(error);
    if (authz) return authz;
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to delete video version." },
      { status: 400 },
    );
  }
}
