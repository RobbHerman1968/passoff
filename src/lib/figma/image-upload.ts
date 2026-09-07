import "server-only";

import sharp from "sharp";

const ALLOWED_TYPES = new Set(["image/png", "image/jpeg", "image/jpg", "image/webp", "image/gif"]);

export const IMAGE_UPLOAD_MAX_BYTES = 12 * 1024 * 1024;
export const IMAGE_UPLOAD_MAX_FILES = 30;

export function isAllowedImageType(type: string) {
  return ALLOWED_TYPES.has(type.toLowerCase());
}

export function screenNameFromFileName(fileName: string) {
  const base = fileName.replace(/\.[^.]+$/, "").trim();
  return (base || "Untitled screen").slice(0, 200);
}

/** Normalize any supported raster image to PNG bytes + dimensions for preview storage. */
export async function normalizeUploadToPng(bytes: Buffer) {
  const image = sharp(bytes, { animated: false, failOn: "none" });
  const metadata = await image.metadata();
  const width = metadata.width ?? null;
  const height = metadata.height ?? null;
  const png = await image.png().toBuffer();
  return { png, width, height };
}
