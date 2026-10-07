import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

const BLOCKED_HOSTS = new Set([
  "localhost",
  "metadata.google.internal",
  "metadata.goog",
  "instance-data",
]);

function parseIpv4(address: string): [number, number, number, number] | null {
  const parts = address.split(".");
  if (parts.length !== 4) return null;
  const numbers = parts.map((part) => (/^\d{1,3}$/.test(part) ? Number(part) : Number.NaN));
  if (numbers.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return null;
  return numbers as [number, number, number, number];
}

/** Anything that is not clearly a public unicast address is refused. */
function isBlockedIpv4(address: string): boolean {
  const parsed = parseIpv4(address);
  if (!parsed) return true;
  const [a, b, c] = parsed;
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 100 && b >= 64 && b <= 127) return true; // carrier-grade NAT
  if (a === 169 && b === 254) return true; // link-local and cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 0 && (c === 0 || c === 2)) return true;
  if (a === 192 && b === 168) return true;
  if (a === 198 && (b === 18 || b === 19)) return true; // benchmarking
  if (a === 198 && b === 51 && c === 100) return true;
  if (a === 203 && b === 0 && c === 113) return true;
  if (a >= 224) return true; // multicast, reserved, broadcast
  return false;
}

/** Expands any IPv6 text form into eight 16-bit groups, or null when it is not valid. */
function expandIpv6(address: string): number[] | null {
  let text = address.toLowerCase();
  const zone = text.indexOf("%");
  if (zone !== -1) text = text.slice(0, zone);

  let tail: number[] = [];
  const lastColon = text.lastIndexOf(":");
  const dotted = text.slice(lastColon + 1);
  if (dotted.includes(".")) {
    const v4 = parseIpv4(dotted);
    if (!v4) return null;
    tail = [(v4[0] << 8) | v4[1], (v4[2] << 8) | v4[3]];
    text = `${text.slice(0, lastColon + 1)}0:0`;
  }

  const halves = text.split("::");
  if (halves.length > 2) return null;
  const toGroups = (part: string) => (part === "" ? [] : part.split(":"));
  const head = toGroups(halves[0] ?? "");
  const rest = halves.length === 2 ? toGroups(halves[1] ?? "") : [];
  const missing = 8 - head.length - rest.length;
  if (halves.length === 1 ? head.length !== 8 : missing < 1) return null;

  const groups = [...head, ...Array<string>(halves.length === 2 ? missing : 0).fill("0"), ...rest];
  if (groups.length !== 8) return null;
  const numbers = groups.map((group) => (/^[0-9a-f]{1,4}$/.test(group) ? parseInt(group, 16) : Number.NaN));
  if (numbers.some((value) => Number.isNaN(value))) return null;
  if (tail.length === 2) {
    numbers[6] = tail[0];
    numbers[7] = tail[1];
  }
  return numbers;
}

function embeddedIpv4(high: number, low: number) {
  return `${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`;
}

function isBlockedIpv6(address: string): boolean {
  const g = expandIpv6(address);
  if (!g) return true;
  if (g.every((value) => value === 0)) return true; // ::
  if (g.slice(0, 7).every((value) => value === 0) && g[7] === 1) return true; // ::1
  if ((g[0] & 0xfe00) === 0xfc00) return true; // unique local fc00::/7
  if ((g[0] & 0xffc0) === 0xfe80) return true; // link-local fe80::/10
  if ((g[0] & 0xffc0) === 0xfec0) return true; // site-local fec0::/10
  if ((g[0] & 0xff00) === 0xff00) return true; // multicast
  if (g[0] === 0x2001 && g[1] === 0x0db8) return true; // documentation
  // IPv4 carried inside IPv6: judge the address that is really being reached.
  if (g.slice(0, 5).every((value) => value === 0) && (g[5] === 0xffff || g[5] === 0)) {
    return isBlockedIpv4(embeddedIpv4(g[6], g[7])); // ::ffff:a.b.c.d and ::a.b.c.d
  }
  if (g[0] === 0x0064 && g[1] === 0xff9b) return isBlockedIpv4(embeddedIpv4(g[6], g[7])); // NAT64
  if (g[0] === 0x2002) return isBlockedIpv4(embeddedIpv4(g[1], g[2])); // 6to4
  return false;
}

export function isBlockedIp(address: string): boolean {
  const bare = address.replace(/^\[|\]$/g, "");
  return bare.includes(":") ? isBlockedIpv6(bare) : isBlockedIpv4(bare);
}

export type WebhookUrlCheck =
  | {
      ok: true;
      href: string;
      hostname: string;
      port: string;
      /** The vetted address deliveries must connect to. Set by resolveWebhookDestination. */
      address?: string;
      family?: 4 | 6;
    }
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

  // IPv6 literals keep their brackets in `hostname`; strip them before judging.
  const hostname = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (
    BLOCKED_HOSTS.has(hostname) ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".internal") ||
    hostname.endsWith(".local")
  ) {
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
    return { ...parsed, address: parsed.hostname, family: isIP(parsed.hostname) === 6 ? 6 : 4 };
  }

  try {
    const records = await lookup(parsed.hostname, { all: true, verbatim: true });
    if (records.length === 0) {
      return { ok: false, message: "Passoff couldn’t resolve that address." };
    }
    if (records.some((record) => isBlockedIp(record.address))) {
      return { ok: false, message: "That address isn’t allowed." };
    }
    // Deliveries connect to this exact address, so the name cannot resolve somewhere
    // else between this check and the request (DNS rebinding).
    const chosen = records[0];
    return { ...parsed, address: chosen.address, family: chosen.family === 6 ? 6 : 4 };
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
