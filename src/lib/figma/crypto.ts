import "server-only";

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

import { getFigmaConfig } from "./config";

const ALGORITHM = "aes-256-gcm";

export function encryptToken(value: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, getFigmaConfig().encryptionKey, iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv, tag, encrypted].map((part) => part.toString("base64url")).join(".");
}

export function decryptToken(value: string) {
  const [ivPart, tagPart, encryptedPart] = value.split(".");
  if (!ivPart || !tagPart || !encryptedPart) throw new Error("Invalid encrypted token payload.");

  const decipher = createDecipheriv(
    ALGORITHM,
    getFigmaConfig().encryptionKey,
    Buffer.from(ivPart, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(tagPart, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(encryptedPart, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}
