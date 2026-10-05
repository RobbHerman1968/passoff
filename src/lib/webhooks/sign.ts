import { createHmac, timingSafeEqual } from "node:crypto";

export function signWebhookBody(secret: string, timestampSeconds: number, rawBody: string): string {
  const payload = `${timestampSeconds}.${rawBody}`;
  const digest = createHmac("sha256", secret).update(payload).digest("hex");
  return `t=${timestampSeconds},v1=${digest}`;
}

export function verifyWebhookSignature(input: {
  secret: string;
  header: string;
  rawBody: string;
  nowSeconds?: number;
  maxAgeSeconds?: number;
}): boolean {
  const maxAge = input.maxAgeSeconds ?? 5 * 60;
  const now = input.nowSeconds ?? Math.floor(Date.now() / 1000);
  const parts = Object.fromEntries(
    input.header.split(",").map((part) => {
      const [key, ...rest] = part.trim().split("=");
      return [key, rest.join("=")];
    }),
  );
  const timestamp = Number(parts.t);
  const digest = parts.v1;
  if (!Number.isFinite(timestamp) || !digest) return false;
  if (Math.abs(now - timestamp) > maxAge) return false;
  const expected = signWebhookBody(input.secret, timestamp, input.rawBody);
  const expectedDigest = expected.split("v1=")[1] ?? "";
  const left = Buffer.from(digest, "utf8");
  const right = Buffer.from(expectedDigest, "utf8");
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}
