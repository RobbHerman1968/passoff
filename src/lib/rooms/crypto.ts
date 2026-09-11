import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export function generateShareToken() {
  return randomBytes(32).toString("base64url");
}

export function hashShareToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function tokensMatch(rawToken: string, tokenHash: string) {
  const left = Buffer.from(hashShareToken(rawToken), "hex");
  const right = Buffer.from(tokenHash, "hex");
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

/** Stable digest of frozen revision asset membership + checksums. */
export function computeRevisionDigest(
  members: Array<{ assetId: string; checksum: string | null; sortOrder: number }>,
  designs: Array<{
    designVersionId: string;
    contentSha256: string;
    sortOrder: number;
    displayMetaJson?: string;
  }> = [],
) {
  const selectedScreens = (displayMetaJson?: string) => {
    if (!displayMetaJson) return "";
    try {
      const parsed = JSON.parse(displayMetaJson) as { selectedScreenIds?: unknown };
      if (!Array.isArray(parsed.selectedScreenIds)) return "";
      const ids = parsed.selectedScreenIds
        .filter((id): id is string => typeof id === "string")
        .sort();
      return ids.length ? `:${ids.join(",")}` : "";
    } catch {
      return "";
    }
  };
  const orderedAssets = [...members]
    .sort((a, b) => a.sortOrder - b.sortOrder || a.assetId.localeCompare(b.assetId))
    .map((m) => `${m.sortOrder}:${m.assetId}:${m.checksum || ""}`)
    .join("|");
  if (designs.length === 0) {
    return createHash("sha256").update(orderedAssets).digest("hex");
  }
  const assetsCanonical = [...members]
    .sort((a, b) => a.sortOrder - b.sortOrder || a.assetId.localeCompare(b.assetId))
    .map((m) => `asset:${m.sortOrder}:${m.assetId}:${m.checksum || ""}`)
    .join("|");
  const designsCanonical = [...designs]
    .sort((a, b) => a.sortOrder - b.sortOrder || a.designVersionId.localeCompare(b.designVersionId))
    .map((design) => `design:${design.sortOrder}:${design.designVersionId}:${design.contentSha256}${selectedScreens(design.displayMetaJson)}`)
    .join("|");
  return createHash("sha256").update(`${assetsCanonical}||${designsCanonical}`).digest("hex");
}

export function clampPercent(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

export function sanitizeCommentBody(body: string) {
  return body.replace(/\s+/g, " ").trim().slice(0, 2000);
}
