import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

const BLOCKED_HOSTS = new Set([
  "localhost",
  "metadata.google.internal",
  "metadata.goog",
  "instance-data",
]);

function isPrivateIpv4(address: string): boolean {
  const parts = address.split(".").map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return true;
  }
  const [a, b] = parts;
  if (a === 10 || a === 127 || a === 0) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  return false;
}

function isBlockedIp(address: string): boolean {
  if (address.includes(":")) {
    const normalized = address.toLowerCase();
    if (
      normalized === "::1" ||
      normalized.startsWith("fc") ||
      normalized.startsWith("fd") ||
      normalized.startsWith("fe80") ||
      normalized.startsWith("::ffff:127.") ||
      normalized.startsWith("::ffff:10.") ||
      normalized.startsWith("::ffff:192.168.")
    ) {
      return true;
    }
    const mapped = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped?.[1]) return isPrivateIpv4(mapped[1]);
    return false;
  }
  return isPrivateIpv4(address);
}

export type WebhookUrlCheck =
  | { ok: true; href: string; hostname: string; port: string }
  | { ok: false; message: string };

export function parseWebhookUrl(raw: string, production: boolean): WebhookUrlCheck {
  let parsed: URL;
  try {
    parsed = new URL(raw.trim());
  } catch {
    return { ok: false, message: "Enter a valid https address." };
  }

  if (parsed.username || parsed.password) {
    return { ok: false, message: "Endpoint addresses can’t include usernames or passwords." };
  }

  if (production) {
    if (parsed.protocol !== "https:") {
      return { ok: false, message: "Production endpoints must use https." };
    }
  } else if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    return { ok: false, message: "Endpoints must use http or https." };
  }

  const hostname = parsed.hostname.toLowerCase();
  if (BLOCKED_HOSTS.has(hostname) || hostname.endsWith(".localhost")) {
    return { ok: false, message: "That address isn’t allowed." };
  }

  if (isIP(hostname) && isBlockedIp(hostname)) {
    return { ok: false, message: "That address isn’t allowed." };
  }

  const port = parsed.port || (parsed.protocol === "https:" ? "443" : "80");
  const allowedPorts = production ? new Set(["443"]) : new Set(["80", "443"]);
  if (!allowedPorts.has(port)) {
    return { ok: false, message: "That port isn’t allowed." };
  }

  return { ok: true, href: parsed.href, hostname, port };
}

export async function resolveWebhookDestination(
  href: string,
  production: boolean,
): Promise<WebhookUrlCheck> {
  const parsed = parseWebhookUrl(href, production);
  if (!parsed.ok) return parsed;

  if (isIP(parsed.hostname)) {
    return parsed;
  }

  try {
    const records = await lookup(parsed.hostname, { all: true, verbatim: true });
    if (records.length === 0) {
      return { ok: false, message: "Passoff couldn’t resolve that address." };
    }
    if (records.some((record) => isBlockedIp(record.address))) {
      return { ok: false, message: "That address isn’t allowed." };
    }
    return parsed;
  } catch {
    return { ok: false, message: "Passoff couldn’t resolve that address." };
  }
}

export function friendlyDeliveryError(input: {
  kind: "timeout" | "network" | "redirect" | "rejected" | "retry" | "unknown";
  retryInMs?: number;
}): string {
  if (input.kind === "timeout") return "The endpoint took too long to respond.";
  if (input.kind === "network") return "The endpoint could not be reached.";
  if (input.kind === "redirect") return "The endpoint redirected the delivery, which Passoff does not follow.";
  if (input.kind === "rejected") return "The endpoint rejected this delivery.";
  if (input.kind === "retry" && input.retryInMs) {
    const minutes = Math.max(1, Math.round(input.retryInMs / 60_000));
    return `Passoff will try again in about ${minutes} minute${minutes === 1 ? "" : "s"}.`;
  }
  return "The endpoint could not be reached.";
}
