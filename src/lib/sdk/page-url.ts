/**
 * Normalize a page URL for issue listing and storage.
 * Drops hash fragments; keeps origin, pathname, and search.
 */
export function normalizePageUrl(raw: string | null | undefined): string | null {
  if (!raw || typeof raw !== "string") {
    return null;
  }
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > 4_096) {
    return null;
  }
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return null;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return null;
  }
  if (parsed.username || parsed.password) {
    return null;
  }
  parsed.hash = "";
  return parsed.toString();
}

export function pageRouteFromUrl(pageUrl: string): string {
  try {
    const parsed = new URL(pageUrl);
    return `${parsed.pathname}${parsed.search}` || "/";
  } catch {
    return "/";
  }
}

/** Match two normalized page URLs for the same review page. */
export function pageUrlsMatch(left: string, right: string): boolean {
  const a = normalizePageUrl(left);
  const b = normalizePageUrl(right);
  return Boolean(a && b && a === b);
}
