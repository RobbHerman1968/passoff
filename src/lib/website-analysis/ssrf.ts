import { isIP } from "node:net";
import { promises as dns } from "node:dns";

import { isOriginAllowed, normalizeOrigin } from "@/lib/installations/origin";

const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "localhost.localdomain",
  "metadata.google.internal",
  "metadata",
]);

export type ResolvedAddress = {
  address: string;
  family: 4 | 6;
};

export type UrlValidationFailure =
  | "invalid_url"
  | "unsupported_protocol"
  | "credentials_present"
  | "blocked_hostname"
  | "blocked_ip"
  | "origin_not_allowed"
  | "dns_failed"
  | "dns_blocked";

export type ValidatedFetchTarget =
  | {
      ok: true;
      url: URL;
      origin: string;
      hostname: string;
      addresses: ResolvedAddress[];
    }
  | { ok: false; reason: UrlValidationFailure; message: string };

function normalizeHostname(hostname: string): string {
  return hostname.trim().toLowerCase().replace(/\.$/, "");
}

function parseIpv4(address: string): number[] | null {
  const parts = address.split(".");
  if (parts.length !== 4) return null;
  const nums = parts.map((part) => Number(part));
  if (nums.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return null;
  return nums;
}

/** Reject private, loopback, link-local, multicast, and other reserved ranges. */
export function isBlockedIpAddress(address: string): boolean {
  const kind = isIP(address);
  if (kind === 4) {
    const parts = parseIpv4(address);
    if (!parts) return true;
    const [a, b] = parts;

    if (a === 0) return true; // 0.0.0.0/8
    if (a === 10) return true; // 10.0.0.0/8
    if (a === 127) return true; // loopback
    if (a === 169 && b === 254) return true; // link-local / metadata
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
    if (a === 192 && b === 0 && parts[2] === 0) return true;
    if (a === 192 && b === 0 && parts[2] === 2) return true;
    if (a === 198 && (b === 18 || b === 19)) return true;
    if (a === 198 && b === 51 && parts[2] === 100) return true;
    if (a === 203 && b === 0 && parts[2] === 113) return true;
    if (a >= 224) return true; // multicast + reserved
    return false;
  }

  if (kind === 6) {
    const normalized = address.toLowerCase();
    if (normalized === "::" || normalized === "::1") return true;
    if (normalized.startsWith("fc") || normalized.startsWith("fd")) return true; // unique local
    if (normalized.startsWith("fe80:")) return true; // link-local
    if (normalized.startsWith("ff")) return true; // multicast
    // IPv4-mapped IPv6
    const mapped = normalized.match(/^:ffff:(\d+\.\d+\.\d+\.\d+)$/i);
    if (mapped?.[1]) return isBlockedIpAddress(mapped[1]);
    const mappedHex = normalized.match(
      /^:ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i,
    );
    if (mappedHex) {
      const hi = Number.parseInt(mappedHex[1]!, 16);
      const lo = Number.parseInt(mappedHex[2]!, 16);
      const ipv4 = `${(hi >> 8) & 255}.${hi & 255}.${(lo >> 8) & 255}.${lo & 255}`;
      return isBlockedIpAddress(ipv4);
    }
    return false;
  }

  return true;
}

export function isBlockedHostname(hostname: string): boolean {
  const host = normalizeHostname(hostname);
  if (!host) return true;
  if (BLOCKED_HOSTNAMES.has(host)) return true;
  if (host.endsWith(".localhost") || host.endsWith(".local")) return true;
  if (host.endsWith(".internal") || host.endsWith(".intranet")) return true;
  if (isIP(host) && isBlockedIpAddress(host)) return true;
  return false;
}

export type LookupFn = (hostname: string) => Promise<ResolvedAddress[]>;

export const defaultDnsLookup: LookupFn = async (hostname) => {
  const results = await dns.lookup(hostname, { all: true, verbatim: true });
  return results.map((item) => ({
    address: item.address,
    family: item.family === 6 ? 6 : 4,
  }));
};

/**
 * Validate a candidate fetch URL before every request and redirect hop.
 * Only http/https, no credentials, public DNS, and within allowed origins.
 */
export async function validateFetchTarget(input: {
  rawUrl: string;
  allowedOrigins: string[];
  lookup?: LookupFn;
}): Promise<ValidatedFetchTarget> {
  let parsed: URL;
  try {
    parsed = new URL(input.rawUrl);
  } catch {
    return {
      ok: false,
      reason: "invalid_url",
      message: "The website address is not valid.",
    };
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return {
      ok: false,
      reason: "unsupported_protocol",
      message: "Only http and https website addresses can be analyzed.",
    };
  }

  if (parsed.username || parsed.password) {
    return {
      ok: false,
      reason: "credentials_present",
      message: "Website addresses with usernames or passwords cannot be analyzed.",
    };
  }

  const hostname = normalizeHostname(parsed.hostname);
  if (!hostname || isBlockedHostname(hostname)) {
    return {
      ok: false,
      reason: "blocked_hostname",
      message: "This website address cannot be analyzed for security reasons.",
    };
  }

  const origin = normalizeOrigin(parsed.origin);
  if (!origin.ok || !isOriginAllowed(origin.origin, input.allowedOrigins)) {
    return {
      ok: false,
      reason: "origin_not_allowed",
      message:
        "Passoff can only analyze the starting address and allowed origins for this review.",
    };
  }

  if (isIP(hostname)) {
    if (isBlockedIpAddress(hostname)) {
      return {
        ok: false,
        reason: "blocked_ip",
        message: "This website address cannot be analyzed for security reasons.",
      };
    }
    return {
      ok: true,
      url: parsed,
      origin: origin.origin,
      hostname,
      addresses: [
        {
          address: hostname,
          family: isIP(hostname) === 6 ? 6 : 4,
        },
      ],
    };
  }

  const lookup = input.lookup ?? defaultDnsLookup;
  let addresses: ResolvedAddress[];
  try {
    addresses = await lookup(hostname);
  } catch {
    return {
      ok: false,
      reason: "dns_failed",
      message: "We couldn’t look up this website right now.",
    };
  }

  if (!addresses.length) {
    return {
      ok: false,
      reason: "dns_failed",
      message: "We couldn’t look up this website right now.",
    };
  }

  if (addresses.some((entry) => isBlockedIpAddress(entry.address))) {
    return {
      ok: false,
      reason: "dns_blocked",
      message: "This website address cannot be analyzed for security reasons.",
    };
  }

  return {
    ok: true,
    url: parsed,
    origin: origin.origin,
    hostname,
    addresses,
  };
}
