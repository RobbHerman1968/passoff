import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { generateClientTokenFromReadWriteToken } from "@vercel/blob/client";
import { NextResponse } from "next/server";

import { clientIp, rateLimit } from "@/lib/rooms/rate-limit";
import {
  addHandoffItem,
  buildHandoffBlobClientTokenConstraints,
  completeHandoffDirectUpload,
  deleteHandoffItem,
  prepareHandoffDirectUpload,
  releaseHandoff,
  reopenRoom,
  uploadHandoffFile,
  type HandoffUploadTokenMeta,
} from "@/lib/rooms/service";
import { MAX_UPLOAD_BYTES, isHandoffMultipartAllowed } from "@/lib/rooms/storage";
import { getDefaultWorkspaceScope } from "@/lib/tenant/context";
import type { WorkspaceScope } from "@/lib/tenant/scope";
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
          "Direct Blob uploads require BLOB_READ_WRITE_TOKEN. For local development without Blob, use multipart fallback.",
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

function scopeFromMeta(meta: HandoffUploadTokenMeta): WorkspaceScope {
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

function parseTokenPayload(raw: unknown): HandoffUploadTokenMeta | null {
  if (typeof raw !== "string" || !raw.trim()) return null;
  try {
    const parsed = JSON.parse(raw) as HandoffUploadTokenMeta;
    if (
      !parsed ||
      typeof parsed.workspaceId !== "string" ||
      typeof parsed.organizationId !== "string" ||
      typeof parsed.userId !== "string" ||
      typeof parsed.projectId !== "string" ||
      typeof parsed.pathname !== "string" ||
      typeof parsed.uploadSessionId !== "string" ||
      typeof parsed.contentType !== "string" ||
      typeof parsed.size !== "number" ||
      typeof parsed.fileName !== "string"
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    if (!uuidPattern.test(id)) {
      return NextResponse.json({ error: "Invalid room id." }, { status: 400 });
    }

    const contentType = request.headers.get("content-type") || "";

    // Vercel Blob completion webhooks have no session cookie — verify via handleUpload only.
    if (contentType.includes("application/json")) {
      const peek = await request.clone().json().catch(() => null);
      if (isBlobCompletionBody(peek)) {
        const misconfigured = requireBlobConfigured();
        if (misconfigured) return misconfigured;

        const jsonResponse = await handleUpload({
          body: peek,
          request,
          token: process.env.BLOB_READ_WRITE_TOKEN,
          onBeforeGenerateToken: async () => {
            throw new Error("Token generation is not available on the completion callback path.");
          },
          onUploadCompleted: async ({ blob, tokenPayload }) => {
            const meta = parseTokenPayload(tokenPayload);
            if (!meta) throw new Error("Invalid upload completion payload.");
            // PutBlobResult has no size — always re-verify via Blob head inside complete.
            await completeHandoffDirectUpload({
              scope: scopeFromMeta(meta),
              projectId: id,
              meta,
              pathname: blob.pathname,
              blobUrl: blob.url,
              contentType: blob.contentType,
            });
          },
        });
        return NextResponse.json(jsonResponse);
      }
    }

    const scope = await getDefaultWorkspaceScope();

    // Local-dev multipart fallback only — never on production/Vercel or when Blob is configured.
    if (contentType.includes("multipart/form-data")) {
      if (!isHandoffMultipartAllowed()) {
        return NextResponse.json(
          {
            error:
              "Multipart handoff uploads are disabled outside local development without Blob.",
          },
          { status: 403 },
        );
      }

      const limited = rateLimit(`handoff-upload:${scope.userId}:${clientIp(request)}`, 20, 60_000);
      if (!limited.ok) {
        return NextResponse.json(
          { error: "Upload rate limit exceeded." },
          { status: 429, headers: { "Retry-After": String(limited.retryAfterSec) } },
        );
      }

      const form = await request.formData();
      const file = form.get("file");
      if (!(file instanceof File)) {
        return NextResponse.json({ error: "A file is required." }, { status: 400 });
      }
      if (file.size > MAX_UPLOAD_BYTES) {
        return NextResponse.json({ error: "Files must be 25 MB or smaller." }, { status: 400 });
      }
      const label = typeof form.get("label") === "string" ? String(form.get("label")).trim() : "";
      const notes = typeof form.get("notes") === "string" ? String(form.get("notes")) : undefined;
      const externalUrl =
        typeof form.get("externalUrl") === "string" ? String(form.get("externalUrl")) : undefined;

      const result = await uploadHandoffFile({
        scope,
        projectId: id,
        fileName: file.name || "handoff.bin",
        mime: file.type || "application/octet-stream",
        bytes: Buffer.from(await file.arrayBuffer()),
        label: label || undefined,
        notes,
        externalUrl,
      });
      return NextResponse.json(result, { status: 201 });
    }

    const body = (await request.json()) as {
      action?: unknown;
      label?: unknown;
      category?: unknown;
      notes?: unknown;
      externalUrl?: unknown;
      assetId?: unknown;
      itemId?: unknown;
      fileName?: unknown;
      contentType?: unknown;
      size?: unknown;
      pathname?: unknown;
      blobUrl?: unknown;
      uploadSessionId?: unknown;
      tokenPayload?: unknown;
    };

    if (body.action === "reopen") {
      const draft = await reopenRoom(scope, id);
      return NextResponse.json({ revision: draft }, { status: 201 });
    }

    if (body.action === "release") {
      const result = await releaseHandoff(scope, id);
      return NextResponse.json(result);
    }

    if (body.action === "delete") {
      const itemId = typeof body.itemId === "string" ? body.itemId : "";
      if (!itemId) return NextResponse.json({ error: "itemId is required." }, { status: 400 });
      const result = await deleteHandoffItem(scope, id, itemId);
      return NextResponse.json(result);
    }

    if (body.action === "prepare_upload") {
      const misconfigured = requireBlobConfigured();
      if (misconfigured) return misconfigured;

      const meta = await prepareHandoffDirectUpload({
        scope,
        projectId: id,
        fileName: typeof body.fileName === "string" ? body.fileName : "handoff.bin",
        contentType: String(body.contentType || ""),
        size: typeof body.size === "number" ? body.size : 0,
      });

      const tokenPayload = JSON.stringify(meta);
      const tokenConstraints = buildHandoffBlobClientTokenConstraints(meta);
      const clientToken = await generateClientTokenFromReadWriteToken({
        token: process.env.BLOB_READ_WRITE_TOKEN,
        ...tokenConstraints,
        onUploadCompleted: {
          callbackUrl: `${getSiteUrl()}/api/projects/${id}/handoff`,
          tokenPayload,
        },
      });

      return NextResponse.json({
        pathname: meta.pathname,
        clientToken,
        uploadSessionId: meta.uploadSessionId,
        tokenPayload,
        maxBytes: MAX_UPLOAD_BYTES,
        authorizedBytes: meta.size,
      });
    }

    if (body.action === "complete_upload") {
      const meta = parseTokenPayload(body.tokenPayload);
      if (!meta) {
        return NextResponse.json(
          { error: "Missing or invalid upload authorization payload." },
          { status: 400 },
        );
      }

      const blobUrl = typeof body.blobUrl === "string" ? body.blobUrl : "";
      if (!blobUrl) {
        return NextResponse.json({ error: "Missing upload completion fields." }, { status: 400 });
      }

      const result = await completeHandoffDirectUpload({
        scope,
        projectId: id,
        meta,
        pathname: typeof body.pathname === "string" ? body.pathname : undefined,
        blobUrl,
        contentType: typeof body.contentType === "string" ? body.contentType : undefined,
        size: typeof body.size === "number" ? body.size : undefined,
        uploadSessionId:
          typeof body.uploadSessionId === "string" ? body.uploadSessionId : undefined,
        label: typeof body.label === "string" ? body.label : undefined,
        notes: typeof body.notes === "string" ? body.notes : undefined,
        externalUrl: typeof body.externalUrl === "string" ? body.externalUrl : undefined,
      });

      return NextResponse.json(result, { status: result.idempotent ? 200 : 201 });
    }

    const label = typeof body.label === "string" ? body.label.trim() : "";
    if (!label) return NextResponse.json({ error: "A handoff label is required." }, { status: 400 });

    const result = await addHandoffItem({
      scope,
      projectId: id,
      label,
      category: typeof body.category === "string" ? body.category : undefined,
      notes: typeof body.notes === "string" ? body.notes : undefined,
      externalUrl: typeof body.externalUrl === "string" ? body.externalUrl : undefined,
      assetId: typeof body.assetId === "string" ? body.assetId : undefined,
    });
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    logError("handoff.route_failed", {
      error: error instanceof Error ? error.message : "unknown",
    });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to update handoff." },
      { status: 400 },
    );
  }
}
