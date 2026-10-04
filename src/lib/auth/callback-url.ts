const DEFAULT_CALLBACK = "/dashboard";

/**
 * Sanitize Auth.js callbackUrl values to prevent open redirects.
 * Only same-origin relative paths are allowed.
 */
export function sanitizeCallbackUrl(
  candidate: string | null | undefined,
  fallback: string = DEFAULT_CALLBACK,
): string {
  if (!candidate) {
    return fallback;
  }

  const trimmed = candidate.trim();
  if (!trimmed.startsWith("/") || trimmed.startsWith("//") || trimmed.includes("\\")) {
    return fallback;
  }

  try {
    const url = new URL(trimmed, "https://passoff.local");
    if (url.origin !== "https://passoff.local") {
      return fallback;
    }

    const path = `${url.pathname}${url.search}${url.hash}`;
    if (!path.startsWith("/") || path.startsWith("//")) {
      return fallback;
    }

    return path;
  } catch {
    return fallback;
  }
}
