import { randomUUID } from "node:crypto";

import { NextResponse } from "next/server";

import {
  IMAGE_UPLOAD_MAX_BYTES,
  IMAGE_UPLOAD_MAX_FILES,
  isAllowedImageType,
  normalizeUploadToPng,
  screenNameFromFileName,
} from "@/lib/figma/image-upload";
import { getFigmaImport, saveFigmaImport } from "@/lib/figma/persistence";
import { writePreviewPng } from "@/lib/figma/preview-storage";
import type { FigmaImportResult, FigmaScreen } from "@/lib/figma/types";
import { resolveTenantFromRequest } from "@/lib/tenant/context";

export const runtime = "nodejs";

function validFileKey(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]+$/.test(value) && value.length <= 200;
}

export async function POST(request: Request) {
  const contentType = request.headers.get("content-type") || "";
  if (!contentType.includes("multipart/form-data")) {
    return NextResponse.json({ error: "Expected a multipart image upload." }, { status: 415 });
  }

  try {
    const form = await request.formData();
    const projectKey = form.get("projectKey");
    const existingFileKey = form.get("fileKey");
    const nameField = form.get("name");
    const files = form.getAll("images").filter((entry): entry is File => entry instanceof File && entry.size > 0);

    if (!files.length) {
      return NextResponse.json({ error: "Choose at least one image to import." }, { status: 400 });
    }
    if (files.length > IMAGE_UPLOAD_MAX_FILES) {
      return NextResponse.json({ error: `You can upload at most ${IMAGE_UPLOAD_MAX_FILES} images at once.` }, { status: 400 });
    }

    const tenant = await resolveTenantFromRequest(request, projectKey);
    const append = validFileKey(existingFileKey);
    let fileKey: string;
    let fileName: string;
    let fileVersion: string;
    let mode: "append" | "replace" = "replace";
    const now = new Date();

    if (append) {
      const existing = await getFigmaImport(tenant, existingFileKey);
      if (!existing) {
        return NextResponse.json({ error: "That project file was not found." }, { status: 404 });
      }
      fileKey = existing.file.key;
      fileName = existing.file.name;
      fileVersion = existing.file.version;
      mode = "append";
    } else {
      const name = typeof nameField === "string" ? nameField.trim().slice(0, 200) : "";
      fileName = name || (files.length === 1 ? screenNameFromFileName(files[0].name) : "Image uploads");
      fileKey = `upload-${randomUUID().replaceAll("-", "")}`;
      fileVersion = `upload-${now.getTime()}`;
    }

    const screens: FigmaScreen[] = [];
    let cursorX = 0;
    const gap = 80;

    for (const file of files) {
      if (!isAllowedImageType(file.type)) {
        return NextResponse.json(
          { error: `“${file.name}” is not a supported image. Use PNG, JPEG, WebP, or GIF.` },
          { status: 400 },
        );
      }
      if (file.size > IMAGE_UPLOAD_MAX_BYTES) {
        return NextResponse.json(
          { error: `“${file.name}” is larger than ${Math.round(IMAGE_UPLOAD_MAX_BYTES / (1024 * 1024))} MB.` },
          { status: 413 },
        );
      }

      const bytes = Buffer.from(await file.arrayBuffer());
      const { png, width, height } = await normalizeUploadToPng(bytes);
      const id = `upload-${randomUUID().replaceAll("-", "")}`;
      const imageUrl = await writePreviewPng(tenant, fileKey, id, png);
      screens.push({
        id,
        name: screenNameFromFileName(file.name),
        type: "FRAME",
        imageUrl,
        width,
        height,
        x: cursorX,
        y: 0,
        interactionCount: 0,
      });
      cursorX += (width ?? 400) + gap;
    }

    const result: FigmaImportResult = {
      file: {
        key: fileKey,
        name: fileName,
        version: fileVersion,
        lastModified: now.toISOString(),
        thumbnailUrl: screens[0]?.imageUrl ?? null,
      },
      screens,
      interactions: [],
      warnings: [],
      importSource: append ? undefined : "upload",
    };

    await saveFigmaImport(tenant, null, result, {
      mode,
      source: append ? undefined : "upload",
    });

    const saved = await getFigmaImport(tenant, fileKey);
    if (!saved) {
      return NextResponse.json({ error: "Images were saved but could not be reloaded." }, { status: 500 });
    }

    return NextResponse.json(saved, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to import images." },
      { status: 400 },
    );
  }
}
