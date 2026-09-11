import { NextResponse } from "next/server";

import { normalizeUploadToPng, isAllowedImageType } from "@/lib/figma/image-upload";
import { clientIp, rateLimit } from "@/lib/rooms/rate-limit";
import {
  addExternalUrlAsset,
  reorderDraftRevisionAssets,
  uploadRoomAsset,
} from "@/lib/rooms/service";
import { getDefaultWorkspaceScope } from "@/lib/tenant/context";

export const runtime = "nodejs";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: roomId } = await params;
    if (!uuidPattern.test(roomId)) {
      return NextResponse.json({ error: "Invalid room id." }, { status: 400 });
    }

    const scope = await getDefaultWorkspaceScope();
    const body = (await request.json()) as { orderedRevisionAssetIds?: unknown };
    const ordered =
      Array.isArray(body.orderedRevisionAssetIds) &&
      body.orderedRevisionAssetIds.every(
        (id): id is string => typeof id === "string" && uuidPattern.test(id),
      )
        ? body.orderedRevisionAssetIds
        : null;
    if (!ordered) {
      return NextResponse.json(
        { error: "orderedRevisionAssetIds must be an array of asset ids." },
        { status: 400 },
      );
    }

    const result = await reorderDraftRevisionAssets(scope, roomId, ordered);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Reorder failed." },
      { status: 400 },
    );
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: roomId } = await params;
    if (!uuidPattern.test(roomId)) {
      return NextResponse.json({ error: "Invalid room id." }, { status: 400 });
    }

    const scope = await getDefaultWorkspaceScope();
    const limited = rateLimit(`upload:${scope.userId}:${clientIp(request)}`, 30, 60_000);
    if (!limited.ok) {
      return NextResponse.json(
        { error: "Upload rate limit exceeded." },
        { status: 429, headers: { "Retry-After": String(limited.retryAfterSec) } },
      );
    }

    const contentType = request.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      const body = (await request.json()) as { url?: unknown; label?: unknown };
      const url = typeof body.url === "string" ? body.url : "";
      const label = typeof body.label === "string" ? body.label.trim() : undefined;
      if (!label) {
        return NextResponse.json({ error: "A name is required for review URLs." }, { status: 400 });
      }
      const asset = await addExternalUrlAsset({ scope, roomId, url, label });
      return NextResponse.json({ asset }, { status: 201 });
    }

    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "A file is required." }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const mime = file.type || "application/octet-stream";

    if (mime.toLowerCase() === "application/pdf") {
      const result = await uploadRoomAsset({
        scope,
        roomId,
        fileName: file.name || "document.pdf",
        mime,
        bytes: buffer,
        kind: "pdf",
      });
      return NextResponse.json(result, { status: 201 });
    }

    if (!isAllowedImageType(mime)) {
      return NextResponse.json({ error: "Only images and PDFs are supported." }, { status: 400 });
    }

    const normalized = await normalizeUploadToPng(buffer);
    const result = await uploadRoomAsset({
      scope,
      roomId,
      fileName: (file.name || "image").replace(/\.[^.]+$/, "") + ".png",
      mime: "image/png",
      bytes: normalized.png,
      kind: "image",
      width: normalized.width,
      height: normalized.height,
    });
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Upload failed." },
      { status: 400 },
    );
  }
}
