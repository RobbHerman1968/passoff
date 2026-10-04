import "server-only";

import { headers } from "next/headers";

/**
 * Coarse, privacy-conscious request fingerprint for durable rate limiting.
 * Never expose the raw value to clients.
 */
export async function getRequestFingerprint(): Promise<string> {
  const headerStore = await headers();
  const forwarded = headerStore.get("x-forwarded-for")?.split(",")[0]?.trim();
  const realIp = headerStore.get("x-real-ip")?.trim();
  const userAgent = headerStore.get("user-agent")?.slice(0, 120) ?? "unknown";
  const ip = forwarded || realIp || "unknown";
  return `${ip}|${userAgent}`;
}
