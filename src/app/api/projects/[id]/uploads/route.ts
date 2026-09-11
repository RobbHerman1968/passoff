import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { generateClientTokenFromReadWriteToken } from "@vercel/blob/client";
import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import {
  authzResponse,
  requireActiveWorkspaceMembership,
} from "@/lib/auth/authorization";
import { db } from "@/db";
import { revisions } from "@/db/schema";
import { assertStorageAllowance } from "@/lib/rooms/entitlements";
import { completeDirectUpload, ensureDraftRevision } from "@/lib/rooms/service";
import {
  ALLOWED_UPLOAD_MIME_TYPES,
  MAX_UPLOAD_BYTES,
  buildTenantObjectPath,
} from "@/lib/rooms/storage";
import type { WorkspaceScope } from "@/lib/tenant/context";
import { getSiteUrl } from "@/lib/site";
import { logError } from "@/lib/logging";

export const runtime = "nodejs";
export const maxDuration = 60;

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type UploadTokenMeta = {
  workspaceId: string;
  organizationId: string;
  userId: string;
  roomId: string;
  revisionId: string;
  pathname: string;
  contentType: string;
  size: number;
  fileName: string;
  uploadSessionId: string;
};

function requireBlobConfigured() {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    if (process.env.NODE_ENV === "production" || process.env.VERCEL === "1") {
      return NextResponse.json(
        { error: "BLOB_READ_WRITE_TOKEN is required for production uploads." },
        { status: 503 },
      );
    }
    return NextResponse.json(
      {
        error:
          "Direct Blob uploads require BLOB_READ_WRITE_TOKEN. For local development without Blob, use multipart /assets.",
        fallback: "multipart",
      },
      { status: 501 },
    );
  }
  return null;
}

function isBlobCompletionBody(body: unknown): body is HandleUploadBody {
  return Boolean(
    body &&
      typeof body === "object" &&
      "type" in body &&
      (body as { type?: string }).type === "blob.upload-completed",
  );
}

function assertOwnedPathname(pathname: string, workspaceId: string, roomId: string) {
  const prefix = `workspaces/${workspaceId}/rooms/${roomId}/revisions/`;
  if (!pathname.startsWith(prefix) || pathname.includes("..")) {
    throw new Error("Upload path is not owned by this room.");
  }
}

function scopeFromMeta(meta: UploadTokenMeta): WorkspaceScope {
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

function parseUploadTokenMeta(raw: string | null | undefined): UploadTokenMeta | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<UploadTokenMeta> & { projectId?: unknown };
    if (!parsed || typeof parsed !== "object") return null;
    const roomId =
      typeof parsed.roomId === "string"
        ? parsed.roomId
        : typeof parsed.projectId === "string"
          ? parsed.projectId
          : null;
    if (
      !roomId ||
      typeof parsed.workspaceId !== "string" ||
      typeof parsed.organizationId !== "string" ||
      typeof parsed.userId !== "string" ||
      typeof parsed.revisionId !== "string" ||
      typeof parsed.pathname !== "string" ||
      typeof parsed.contentType !== "string" ||
      typeof parsed.size !== "number" ||
      typeof parsed.fileName !== "string" ||
      typeof parsed.uploadSessionId !== "string"
    ) {
      return null;
    }
    return {
      workspaceId: parsed.workspaceId,
      organizationId: parsed.organizationId,
      userId: parsed.userId,
      roomId,
      revisionId: parsed.revisionId,
      pathname: parsed.pathname,
      contentType: parsed.contentType,
      size: parsed.size,
      fileName: parsed.fileName,
      uploadSessionId: parsed.uploadSessionId,
    };
  } catch {
    return null;
  }
}

async function finalizeCompletedUpload(input: {
  roomId: string;
  meta: UploadTokenMeta;
  pathname: string;
  blobUrl: string;
  contentType?: string | null;
}) {
  if (input.meta.roomId !== input.roomId) {
    throw new Error("Invalid upload completion payload.");
  }

  const draft = (
    await db
      .select()
      .from(revisions)
      .where(
        and(
          eq(revisions.id, input.meta.revisionId),
          eq(revisions.status, "DRAFT"),
          eq(revisions.roomId, input.roomId),
        ),
      )
      .limit(1)
  )[0];
  if (!draft) throw new Error("Draft revision missing.");

  return completeDirectUpload({
    scope: scopeFromMeta(input.meta),
    roomId: input.roomId,
    revisionId: input.meta.revisionId,
    uploadSessionId: input.meta.uploadSessionId,
    pathname: input.pathname || input.meta.pathname,
    blobUrl: input.blobUrl,
    contentType: input.contentType || input.meta.contentType,
    size: input.meta.size,
    label: (input.meta.fileName || "Untitled").replace(/\.[^.]+$/, ""),
  });
}

/**
 * Direct client uploads.
 * - `{ action: "prepare" }` returns a tenant-scoped pathname + client token
 * - `{ action: "complete" }` registers the Blob object in the DB (works on localhost)
 * - handleUpload body continues to support completion callbacks (production webhook)
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: roomId } = await params;
    if (!uuidPattern.test(roomId)) {
      return NextResponse.json({ error: "Invalid room id." }, { status: 400 });
    }

    const misconfigured = requireBlobConfigured();
    if (misconfigured) return misconfigured;

    const body = (await request.json()) as HandleUploadBody | {
      action?: string;
      fileName?: string;
      contentType?: string;
      size?: number;
      pathname?: string;
      blobUrl?: string;
      revisionId?: string;
      uploadSessionId?: string;
    };

    // Vercel Blob completion webhooks have no session cookie — verify via handleUpload only.
    if (isBlobCompletionBody(body)) {
      const jsonResponse = await handleUpload({
        body,
        request,
        token: process.env.BLOB_READ_WRITE_TOKEN,
        onBeforeGenerateToken: async () => {
          throw new Error("Token generation is not available on the completion callback path.");
        },
        onUploadCompleted: async ({ blob, tokenPayload }) => {
          const meta = parseUploadTokenMeta(tokenPayload);
          if (!meta) throw new Error("Invalid upload completion payload.");
          await finalizeCompletedUpload({
            roomId,
            meta,
            pathname: blob.pathname || meta.pathname,
            blobUrl: blob.url,
            contentType: blob.contentType || meta.contentType,
          });
        },
      });
      return NextResponse.json(jsonResponse);
    }

    const scope = await requireActiveWorkspaceMembership();

    if ("action" in body && body.action === "prepare") {
      const contentType = String(body.contentType || "").toLowerCase();
      if (!(ALLOWED_UPLOAD_MIME_TYPES as readonly string[]).includes(contentType)) {
        return NextResponse.json({ error: "Only images and PDFs are supported." }, { status: 400 });
      }
      const size = typeof body.size === "number" ? body.size : 0;
      if (size <= 0 || size > MAX_UPLOAD_BYTES) {
        return NextResponse.json({ error: "Files must be between 1 byte and 25 MB." }, { status: 400 });
      }
      await assertStorageAllowance(scope.organizationId, scope.workspaceId, size);
      const draft = await ensureDraftRevision(scope.workspaceId, roomId);
      const fileName = typeof body.fileName === "string" ? body.fileName : "upload.bin";
      const pathname = buildTenantObjectPath({
        workspaceId: scope.workspaceId,
        roomId,
        revisionId: draft.id,
        filename: fileName,
      });

      const tokenPayload = JSON.stringify({
        workspaceId: scope.workspaceId,
        organizationId: scope.organizationId,
        userId: scope.userId,
        roomId,
        revisionId: draft.id,
        pathname,
        contentType,
        size,
        fileName,
        uploadSessionId: pathname,
      } satisfies UploadTokenMeta);

      const clientToken = await generateClientTokenFromReadWriteToken({
        token: process.env.BLOB_READ_WRITE_TOKEN,
        pathname,
        allowedContentTypes: [...ALLOWED_UPLOAD_MIME_TYPES],
        maximumSizeInBytes: MAX_UPLOAD_BYTES,
        addRandomSuffix: false,
        onUploadCompleted: {
          callbackUrl: `${getSiteUrl()}/api/projects/${roomId}/uploads`,
          tokenPayload,
        },
      });

      return NextResponse.json({
        pathname,
        clientToken,
        revisionId: draft.id,
        uploadSessionId: pathname,
        tokenPayload,
      });
    }

    // Client-side finalize — required on localhost where Vercel cannot reach the webhook.
    if ("action" in body && body.action === "complete") {
      const pathname = typeof body.pathname === "string" ? body.pathname : "";
      const blobUrl = typeof body.blobUrl === "string" ? body.blobUrl : "";
      const revisionId = typeof body.revisionId === "string" ? body.revisionId : "";
      const uploadSessionId =
        typeof body.uploadSessionId === "string" ? body.uploadSessionId : pathname;
      const contentType = String(body.contentType || "").toLowerCase();
      const size = typeof body.size === "number" ? body.size : 0;
      const fileName = typeof body.fileName === "string" ? body.fileName : "upload.bin";

      if (!pathname || !blobUrl || !revisionId) {
        return NextResponse.json({ error: "Missing upload completion fields." }, { status: 400 });
      }
      assertOwnedPathname(pathname, scope.workspaceId, roomId);
      if (uploadSessionId !== pathname) {
        return NextResponse.json({ error: "Upload session mismatch." }, { status: 400 });
      }
      if (!(ALLOWED_UPLOAD_MIME_TYPES as readonly string[]).includes(contentType)) {
        return NextResponse.json({ error: "Only images and PDFs are supported." }, { status: 400 });
      }
      if (size <= 0 || size > MAX_UPLOAD_BYTES) {
        return NextResponse.json({ error: "Files must be between 1 byte and 25 MB." }, { status: 400 });
      }

      const result = await finalizeCompletedUpload({
        roomId,
        meta: {
          workspaceId: scope.workspaceId,
          organizationId: scope.organizationId,
          userId: scope.userId,
          roomId,
          revisionId,
          pathname,
          contentType,
          size,
          fileName,
          uploadSessionId,
        },
        pathname,
        blobUrl,
        contentType,
      });

      return NextResponse.json({
        ok: true,
        assetId: result.asset.id,
        revisionAssetId: result.revisionAssetId,
        revisionId: result.revisionId,
        idempotent: result.idempotent,
      });
    }

    const jsonResponse = await handleUpload({
      body: body as HandleUploadBody,
      request,
      token: process.env.BLOB_READ_WRITE_TOKEN,
      onBeforeGenerateToken: async (_pathname, clientPayload) => {
        const payload = clientPayload
          ? (JSON.parse(clientPayload) as {
              roomId?: string;
              projectId?: string;
              fileName?: string;
              contentType?: string;
              size?: number;
            })
          : {};
        const payloadRoomId = payload.roomId || payload.projectId;
        if (payloadRoomId && payloadRoomId !== roomId) {
          throw new Error("Room mismatch.");
        }
        const contentType = (payload.contentType || "").toLowerCase();
        if (!(ALLOWED_UPLOAD_MIME_TYPES as readonly string[]).includes(contentType)) {
          throw new Error("Only images and PDFs are supported.");
        }
        const size = typeof payload.size === "number" ? payload.size : 0;
        if (size <= 0 || size > MAX_UPLOAD_BYTES) {
          throw new Error("Files must be between 1 byte and 25 MB.");
        }
        await assertStorageAllowance(scope.organizationId, scope.workspaceId, size);
        const draft = await ensureDraftRevision(scope.workspaceId, roomId);
        const fileName = typeof payload.fileName === "string" ? payload.fileName : "upload.bin";
        const pathname = buildTenantObjectPath({
          workspaceId: scope.workspaceId,
          roomId,
          revisionId: draft.id,
          filename: fileName,
        });
        return {
          allowedContentTypes: [...ALLOWED_UPLOAD_MIME_TYPES],
          maximumSizeInBytes: MAX_UPLOAD_BYTES,
          addRandomSuffix: false,
          tokenPayload: JSON.stringify({
            workspaceId: scope.workspaceId,
            organizationId: scope.organizationId,
            userId: scope.userId,
            roomId,
            revisionId: draft.id,
            pathname,
            contentType,
            size,
            fileName,
            uploadSessionId: pathname,
          } satisfies UploadTokenMeta),
          callbackUrl: `${getSiteUrl()}/api/projects/${roomId}/uploads`,
        };
      },
      onUploadCompleted: async ({ blob, tokenPayload }) => {
        const meta = parseUploadTokenMeta(tokenPayload);
        if (!meta) throw new Error("Invalid upload completion payload.");
        await finalizeCompletedUpload({
          roomId,
          meta,
          pathname: blob.pathname || meta.pathname,
          blobUrl: blob.url,
          contentType: blob.contentType || meta.contentType,
        });
      },
    });

    return NextResponse.json(jsonResponse);
  } catch (error) {
    const authz = authzResponse(error);
    if (authz) return authz;
    logError("upload.token_failed", {
      error: error instanceof Error ? error.message : "unknown",
    });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Upload authorization failed." },
      { status: 400 },
    );
  }
}
