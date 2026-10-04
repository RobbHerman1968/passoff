export type NormalizedOriginResult =
  | { ok: true; origin: string }
  | { ok: false; reason: "invalid" };

/**
 * Normalize an origin for exact comparison.
 * Allows only http/https, rejects credentials, and compares scheme + host + port.
 */
export function normalizeOrigin(raw: string | null | undefined): NormalizedOriginResult {
  if (!raw || typeof raw !== "string") {
    return { ok: false, reason: "invalid" };
  }

  const trimmed = raw.trim();
  if (!trimmed) {
    return { ok: false, reason: "invalid" };
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return { ok: false, reason: "invalid" };
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { ok: false, reason: "invalid" };
  }

  if (parsed.username || parsed.password) {
    return { ok: false, reason: "invalid" };
  }

  if (!parsed.hostname) {
    return { ok: false, reason: "invalid" };
  }

  // URL.origin already drops path/query/hash and normalizes default ports.
  return { ok: true, origin: parsed.origin };
}

export function originsMatch(left: string, right: string): boolean {
  const a = normalizeOrigin(left);
  const b = normalizeOrigin(right);
  if (!a.ok || !b.ok) {
    return false;
  }
  return a.origin === b.origin;
}

export function isOriginAllowed(
  requestOrigin: string | null | undefined,
  allowedOrigins: string[],
): boolean {
  const normalized = normalizeOrigin(requestOrigin);
  if (!normalized.ok) {
    return false;
  }

  return allowedOrigins.some((allowed) => {
    const candidate = normalizeOrigin(allowed);
    return candidate.ok && candidate.origin === normalized.origin;
  });
}
