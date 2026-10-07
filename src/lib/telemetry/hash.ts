import { createHash, createHmac, randomBytes } from "node:crypto";

function abuseKey(): string {
  return (
    process.env.PASSOFF_TELEMETRY_ABUSE_KEY?.trim() ||
    process.env.AUTH_SECRET?.trim() ||
    "dev-telemetry-abuse-key"
  );
}

/**
 * Truncate an IP for transient abuse control, then HMAC it.
 * Never store the complete IP. Never display this value.
 * Scoped by environment so the same network cannot become a cross-customer identifier.
 */
export function hashTruncatedClientAddress(
  ip: string | null | undefined,
  environmentId: string,
): string {
  const truncated = truncateIp(ip ?? "");
  return createHmac("sha256", abuseKey())
    .update(`env:${environmentId}|ip:${truncated}`)
    .digest("hex");
}

export function truncateIp(ip: string): string {
  const value = ip.trim();
  if (!value || value === "unknown") return "unknown";
  if (value.includes(".")) {
    const parts = value.split(".");
    if (parts.length === 4) return `${parts[0]}.${parts[1]}.${parts[2]}.0`;
  }
  if (value.includes(":")) {
    const parts = value.split(":");
    return `${parts.slice(0, 3).join(":")}::`;
  }
  return "unknown";
}

export function hashTabSession(
  environmentId: string,
  clientTabSession: string,
): string {
  return createHmac("sha256", abuseKey())
    .update(`tab:${environmentId}|${clientTabSession}`)
    .digest("hex");
}

export function createTabSessionClientValue(): string {
  return randomBytes(32).toString("hex");
}

export function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function hourBucketUtc(date: Date): Date {
  return new Date(
    Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth(),
      date.getUTCDate(),
      date.getUTCHours(),
      0,
      0,
      0,
    ),
  );
}

export function currentUsagePeriod(now = new Date()): {
  start: Date;
  end: Date;
} {
  const start = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0),
  );
  const end = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1, 0, 0, 0, 0),
  );
  return { start, end };
}
