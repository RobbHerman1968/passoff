import { createHash, randomBytes } from "node:crypto";

export function generateDeveloperHandoffToken() {
  return `dev_${randomBytes(32).toString("base64url")}`;
}

export function hashDeveloperHandoffToken(token: string) {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function isDeveloperHandoffToken(token: string) {
  return /^dev_[A-Za-z0-9_-]{43}$/.test(token);
}
