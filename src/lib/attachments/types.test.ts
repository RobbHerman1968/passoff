import { describe, expect, it } from "vitest";

import {
  ATTACHMENT_FILE_NAME_MAX_LENGTH,
  ATTACHMENT_MAX_BYTES,
  formatBytes,
  sanitizeAttachmentFileName,
  validateAttachmentFile,
} from "@/lib/attachments/types";

describe("sanitizeAttachmentFileName", () => {
  it("drops folders, traversal, control characters, and hidden-file dots", () => {
    expect(sanitizeAttachmentFileName("../../etc/passwd")).toBe("passwd");
    expect(sanitizeAttachmentFileName("C:\\Users\\me\\mock up.png")).toBe("mock up.png");
    expect(sanitizeAttachmentFileName("shot\u0000.png")).toBe("shot.png");
    expect(sanitizeAttachmentFileName("evil\u202Egnp.exe")).toBe("evilgnp.exe");
    expect(sanitizeAttachmentFileName(".htaccess")).toBe("htaccess");
    expect(sanitizeAttachmentFileName("..")).toBe("attachment");
    expect(sanitizeAttachmentFileName("a/b/")).toBe("attachment");
    expect(sanitizeAttachmentFileName("<script>.png")).toBe("script.png");
  });

  it("falls back for empty values and caps length while keeping the extension", () => {
    expect(sanitizeAttachmentFileName(null)).toBe("attachment");
    expect(sanitizeAttachmentFileName("   ")).toBe("attachment");
    const long = `${"a".repeat(300)}.png`;
    const cleaned = sanitizeAttachmentFileName(long);
    expect(cleaned.length).toBe(ATTACHMENT_FILE_NAME_MAX_LENGTH);
    expect(cleaned.endsWith(".png")).toBe(true);
  });
});

describe("validateAttachmentFile", () => {
  it("allows common review files within the size limit", () => {
    expect(validateAttachmentFile({ mimeType: "image/png", byteSize: 1000 }).ok).toBe(true);
    expect(validateAttachmentFile({ mimeType: "application/pdf", byteSize: ATTACHMENT_MAX_BYTES }).ok).toBe(
      true,
    );
    expect(validateAttachmentFile({ mimeType: "IMAGE/JPEG; charset=x", byteSize: 5 }).ok).toBe(true);
  });

  it("explains why a file can’t be attached", () => {
    const type = validateAttachmentFile({ mimeType: "application/x-msdownload", byteSize: 10 });
    expect(type.ok).toBe(false);
    const missing = validateAttachmentFile({ mimeType: null, byteSize: 10 });
    expect(missing.ok).toBe(false);
    const empty = validateAttachmentFile({ mimeType: "image/png", byteSize: 0 });
    expect(empty.ok).toBe(false);
    const big = validateAttachmentFile({ mimeType: "image/png", byteSize: ATTACHMENT_MAX_BYTES + 1 });
    expect(big.ok || big.message).toMatch(/larger than 10 MB/);
  });

  it("formats sizes", () => {
    expect(formatBytes(500)).toBe("500 B");
    expect(formatBytes(2048)).toBe("2 KB");
    expect(formatBytes(10 * 1024 * 1024)).toBe("10 MB");
    expect(formatBytes(null)).toBe("Size unknown");
  });
});
