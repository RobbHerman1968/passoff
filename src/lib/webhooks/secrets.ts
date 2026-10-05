import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const PREFIX = "v1";

function keyBytes(): Buffer {
  const explicit = process.env.PASSOFF_SECRET_ENCRYPTION_KEY?.trim();
  const material = explicit || process.env.AUTH_SECRET?.trim();
  if (!material) {
    throw new Error("missing_secret_encryption_key");
  }
  return createHash("sha256").update(material).digest();
}

export function generateWebhookSecret(): string {
  return `whsec_${randomBytes(24).toString("base64url")}`;
}

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keyBytes(), iv);
  const encrypted = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [PREFIX, iv.toString("base64url"), tag.toString("base64url"), encrypted.toString("base64url")].join(
    ".",
  );
}

export function decryptSecret(stored: string): string {
  const [prefix, ivPart, tagPart, dataPart] = stored.split(".");
  if (prefix !== PREFIX || !ivPart || !tagPart || !dataPart) {
    throw new Error("invalid_secret");
  }
  const decipher = createDecipheriv("aes-256-gcm", keyBytes(), Buffer.from(ivPart, "base64url"));
  decipher.setAuthTag(Buffer.from(tagPart, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(dataPart, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}
