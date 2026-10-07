/** Client-safe attachment rules. Server code enforces them; the UI only explains them. */

export const ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024;
export const MAX_ATTACHMENTS_PER_ISSUE = 20;
export const ATTACHMENT_FILE_NAME_MAX_LENGTH = 120;

export const ATTACHMENT_ALLOWED_MIME_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "application/pdf",
  "text/plain",
] as const;

export type AttachmentView = {
  assetId: string;
  fileName: string;
  mimeType: string | null;
  byteSize: number | null;
  isPrivate: boolean;
  attachedAt: string;
};

export type AttachableAssetView = {
  assetId: string;
  fileName: string;
  mimeType: string | null;
  byteSize: number | null;
};

/**
 * File names come from outside Passoff and are never trusted. This keeps only a
 * short, printable base name: no folders, no `..`, no control characters.
 */
export function sanitizeAttachmentFileName(raw: string | null | undefined): string {
  if (typeof raw !== "string") return "attachment";
  const base = raw.split(/[\\/]/).pop() ?? "";
  const cleaned = base
    .replace(/[\u0000-\u001f\u007f\u2028\u2029\u202a-\u202e\u2066-\u2069]/g, "")
    .replace(/[<>:"|?*]/g, "")
    .replace(/\s+/g, " ")
    .replace(/^[.\s]+/, "")
    .trim();
  if (!cleaned || /^\.+$/.test(cleaned)) return "attachment";
  if (cleaned.length <= ATTACHMENT_FILE_NAME_MAX_LENGTH) return cleaned;

  const dot = cleaned.lastIndexOf(".");
  const ext = dot > 0 && cleaned.length - dot <= 10 ? cleaned.slice(dot) : "";
  return `${cleaned.slice(0, ATTACHMENT_FILE_NAME_MAX_LENGTH - ext.length)}${ext}`;
}

export type AttachmentValidation =
  | { ok: true }
  | { ok: false; message: string };

export function validateAttachmentFile(input: {
  mimeType: string | null | undefined;
  byteSize: number | null | undefined;
}): AttachmentValidation {
  const mime = input.mimeType?.toLowerCase().split(";")[0]?.trim() ?? "";
  if (!(ATTACHMENT_ALLOWED_MIME_TYPES as readonly string[]).includes(mime)) {
    return {
      ok: false,
      message: "This file type can’t be attached. Use an image, PDF, or text file.",
    };
  }
  if (
    typeof input.byteSize !== "number" ||
    !Number.isFinite(input.byteSize) ||
    input.byteSize <= 0
  ) {
    return { ok: false, message: "This file looks empty, so it can’t be attached." };
  }
  if (input.byteSize > ATTACHMENT_MAX_BYTES) {
    return {
      ok: false,
      message: `This file is larger than ${formatBytes(ATTACHMENT_MAX_BYTES)}. Use a smaller file.`,
    };
  }
  return { ok: true };
}

export function formatBytes(bytes: number | null | undefined): string {
  if (typeof bytes !== "number" || !Number.isFinite(bytes) || bytes < 0) {
    return "Size unknown";
  }
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace(/\.0$/, "")} MB`;
}
