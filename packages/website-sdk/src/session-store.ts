/**
 * Tab-scoped session storage for the short-lived SDK bearer token.
 * Never use localStorage for review credentials.
 */

const STORAGE_KEY = "passoff.sdk.session.v1";

export type StoredSdkSession = {
  sessionToken: string;
  expiresAt: string;
  canComment: boolean;
  reviewerName: string;
  privateSelectors: string[];
  installationKey: string;
};

export function readStoredSession(): StoredSdkSession | null {
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredSdkSession;
    if (
      !parsed?.sessionToken ||
      !parsed.expiresAt ||
      typeof parsed.installationKey !== "string"
    ) {
      return null;
    }
    if (new Date(parsed.expiresAt).getTime() <= Date.now()) {
      clearStoredSession();
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function writeStoredSession(session: StoredSdkSession): void {
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  } catch {
    // Private mode / quota — memory-only session still works for this page load.
  }
}

export function clearStoredSession(): void {
  try {
    window.sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

/** Read and strip a one-time exchange code from the URL fragment. */
export function consumeExchangeCodeFromLocation(): string | null {
  try {
    const hash = window.location.hash.startsWith("#")
      ? window.location.hash.slice(1)
      : window.location.hash;
    if (!hash) return null;
    const params = new URLSearchParams(hash);
    const code = params.get("passoff_x")?.trim() || null;
    if (!code) return null;

    params.delete("passoff_x");
    const next = params.toString();
    const url = new URL(window.location.href);
    url.hash = next;
    window.history.replaceState(
      window.history.state,
      "",
      `${url.pathname}${url.search}${next ? `#${next}` : ""}`,
    );
    return code;
  } catch {
    return null;
  }
}

export function createIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `sdk_${crypto.randomUUID()}`;
  }
  return `sdk_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`;
}
