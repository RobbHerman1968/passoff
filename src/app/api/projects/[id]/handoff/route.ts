import { generateClientTokenFromReadWriteToken } from "@vercel/blob/client";
import { NextResponse } from "next/server";

import { clientIp, rateLimit } from "@/lib/rooms/rate-limit";
import {
  addHandoffItem,
  completeHandoffDirectUpload,
  deleteHandoffItem,
  releaseHandoff,
  reopenRoom,
  uploadHandoffFile,
} from "@/lib/rooms/service";
import {
  ALLOWED_HANDOFF_MIME_TYPES,
  MAX_UPLOAD_BYTES,
  buildHandoffObjectPath,
} from "@/lib/rooms/storage";
import { assertStorageAllowance } from "@/lib/rooms/entitlements";
import { getDefaultWorkspaceScope } from "@/lib/tenant/context";

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

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    if (!uuidPattern.test(id)) {
      return NextResponse.json({ error: "Invalid room id." }, { status: 400 });
    }
    const scope = await getDefaultWorkspaceScope();
    const contentType = request.headers.get("content-type") || "";

    // Local-dev multipart fallback when Blob is unavailable — prefer direct Blob in production.
    if (contentType.includes("multipart/form-data")) {
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

      const fileContentType = String(body.contentType || "").toLowerCase();
      if (!(ALLOWED_HANDOFF_MIME_TYPES as readonly string[]).includes(fileContentType)) {
        return NextResponse.json(
          { error: "Handoff uploads support images, PDFs, and ZIP files." },
          { status: 400 },
        );
      }
      const size = typeof body.size === "number" ? body.size : 0;
      if (size <= 0 || size > MAX_UPLOAD_BYTES) {
        return NextResponse.json(
          { error: "Files must be between 1 byte and 25 MB." },
          { status: 400 },
        );
      }
      await assertStorageAllowance(scope.organizationId, scope.workspaceId, size);
      const fileName = typeof body.fileName === "string" ? body.fileName : "handoff.bin";
      const pathname = buildHandoffObjectPath({
        workspaceId: scope.workspaceId,
        projectId: id,
        filename: fileName,
      });

      const clientToken = await generateClientTokenFromReadWriteToken({
        token: process.env.BLOB_READ_WRITE_TOKEN,
        pathname,
        allowedContentTypes: [...ALLOWED_HANDOFF_MIME_TYPES],
        maximumSizeInBytes: MAX_UPLOAD_BYTES,
        addRandomSuffix: false,
      });

      return NextResponse.json({
        pathname,
        clientToken,
        uploadSessionId: pathname,
        maxBytes: MAX_UPLOAD_BYTES,
      });
    }

    if (body.action === "complete_upload") {
      const pathname = typeof body.pathname === "string" ? body.pathname : "";
      const blobUrl = typeof body.blobUrl === "string" ? body.blobUrl : "";
      const uploadSessionId =
        typeof body.uploadSessionId === "string" ? body.uploadSessionId : pathname;
      const fileContentType = String(body.contentType || "").toLowerCase();
      const size = typeof body.size === "number" ? body.size : 0;
      const fileName = typeof body.fileName === "string" ? body.fileName : "handoff.bin";
      const label = typeof body.label === "string" ? body.label : undefined;
      const notes = typeof body.notes === "string" ? body.notes : undefined;
      const externalUrl = typeof body.externalUrl === "string" ? body.externalUrl : undefined;

      if (!pathname || !blobUrl) {
        return NextResponse.json({ error: "Missing upload completion fields." }, { status: 400 });
      }

      const result = await completeHandoffDirectUpload({
        scope,
        projectId: id,
        pathname,
        blobUrl,
        contentType: fileContentType,
        size,
        fileName,
        uploadSessionId,
        label,
        notes,
        externalUrl,
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
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to update handoff." },
      { status: 400 },
    );
  }
}
