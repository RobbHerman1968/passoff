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
import { getSiteUrl } from "@/lib/site";
import { logError } from "@/lib/logging";

export const runtime = "nodejs";
export const maxDuration = 60;

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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

/**
 * Direct client uploads.
 * - `{ action: "prepare" }` returns a tenant-scoped pathname + client token
 * - handleUpload body continues to support completion callbacks
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: projectId } = await params;
    if (!uuidPattern.test(projectId)) {
      return NextResponse.json({ error: "Invalid room id." }, { status: 400 });
    }

    const misconfigured = requireBlobConfigured();
    if (misconfigured) return misconfigured;

    const scope = await requireActiveWorkspaceMembership();
    const body = (await request.json()) as HandleUploadBody | {
      action?: string;
      fileName?: string;
      contentType?: string;
      size?: number;
    };

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
      const draft = await ensureDraftRevision(scope.workspaceId, projectId);
      const fileName = typeof body.fileName === "string" ? body.fileName : "upload.bin";
      const pathname = buildTenantObjectPath({
        workspaceId: scope.workspaceId,
        projectId,
        revisionId: draft.id,
        filename: fileName,
      });

      const clientToken = await generateClientTokenFromReadWriteToken({
        token: process.env.BLOB_READ_WRITE_TOKEN,
        pathname,
        allowedContentTypes: [...ALLOWED_UPLOAD_MIME_TYPES],
        maximumSizeInBytes: MAX_UPLOAD_BYTES,
        addRandomSuffix: false,
        onUploadCompleted: {
          callbackUrl: `${getSiteUrl()}/api/projects/${projectId}/uploads`,
          tokenPayload: JSON.stringify({
            workspaceId: scope.workspaceId,
            organizationId: scope.organizationId,
            userId: scope.userId,
            projectId,
            revisionId: draft.id,
            pathname,
            contentType,
            size,
            fileName,
            uploadSessionId: pathname,
          }),
        },
      });

      return NextResponse.json({
        pathname,
        clientToken,
        revisionId: draft.id,
        uploadSessionId: pathname,
      });
    }

    const jsonResponse = await handleUpload({
      body: body as HandleUploadBody,
      request,
      token: process.env.BLOB_READ_WRITE_TOKEN,
      onBeforeGenerateToken: async (_pathname, clientPayload) => {
        const payload = clientPayload
          ? (JSON.parse(clientPayload) as {
              projectId?: string;
              fileName?: string;
              contentType?: string;
              size?: number;
            })
          : {};
        if (payload.projectId && payload.projectId !== projectId) {
          throw new Error("Project mismatch.");
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
        const draft = await ensureDraftRevision(scope.workspaceId, projectId);
        const fileName = typeof payload.fileName === "string" ? payload.fileName : "upload.bin";
        const pathname = buildTenantObjectPath({
          workspaceId: scope.workspaceId,
          projectId,
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
            projectId,
            revisionId: draft.id,
            pathname,
            contentType,
            size,
            fileName,
            uploadSessionId: pathname,
          }),
          callbackUrl: `${getSiteUrl()}/api/projects/${projectId}/uploads`,
        };
      },
      onUploadCompleted: async ({ blob, tokenPayload }) => {
        const meta = tokenPayload
          ? (JSON.parse(tokenPayload) as {
              workspaceId: string;
              organizationId: string;
              userId: string;
              projectId: string;
              revisionId: string;
              pathname: string;
              contentType: string;
              size: number;
              fileName: string;
              uploadSessionId: string;
            })
          : null;
        if (!meta || meta.projectId !== projectId) {
          throw new Error("Invalid upload completion payload.");
        }

        const draft = (
          await db
            .select()
            .from(revisions)
            .where(
              and(
                eq(revisions.id, meta.revisionId),
                eq(revisions.status, "DRAFT"),
                eq(revisions.projectId, projectId),
              ),
            )
            .limit(1)
        )[0];
        if (!draft) throw new Error("Draft revision missing.");

        await completeDirectUpload({
          scope: {
            organizationId: meta.organizationId,
            organizationName: "",
            workspaceId: meta.workspaceId,
            workspaceName: "",
            userId: meta.userId,
            userName: "",
            userEmail: "",
          },
          projectId,
          revisionId: meta.revisionId,
          uploadSessionId: meta.uploadSessionId,
          pathname: blob.pathname || meta.pathname,
          blobUrl: blob.url,
          contentType: blob.contentType || meta.contentType,
          size: meta.size,
          label: (meta.fileName || "Untitled").replace(/\.[^.]+$/, ""),
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
