import "server-only";

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

const keyPrefix = "pofig_";
const keyPattern = /^pofig_[A-Za-z0-9_-]{43}$/;

export function generateProjectPluginKey() {
  return `${keyPrefix}${randomBytes(32).toString("base64url")}`;
}

export function normalizeProjectPluginKey(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export function hashProjectPluginKey(value: unknown) {
  const key = normalizeProjectPluginKey(value);
  if (!keyPattern.test(key)) return null;
  return createHash("sha256").update(key, "utf8").digest("hex");
}

export function verifyProjectPluginKey(value: unknown, expectedHash: string | null | undefined) {
  const suppliedHash = hashProjectPluginKey(value);
  if (!suppliedHash || !expectedHash || !/^[0-9a-f]{64}$/.test(expectedHash)) return false;
  return timingSafeEqual(Buffer.from(suppliedHash, "hex"), Buffer.from(expectedHash, "hex"));
}
