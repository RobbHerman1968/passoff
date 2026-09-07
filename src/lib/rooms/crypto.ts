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
) {
  const canonical = [...members]
    .sort((a, b) => a.sortOrder - b.sortOrder || a.assetId.localeCompare(b.assetId))
    .map((m) => `${m.sortOrder}:${m.assetId}:${m.checksum || ""}`)
    .join("|");
  return createHash("sha256").update(canonical).digest("hex");
}

export function clampPercent(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

export function sanitizeCommentBody(body: string) {
  return body.replace(/\s+/g, " ").trim().slice(0, 2000);
}
