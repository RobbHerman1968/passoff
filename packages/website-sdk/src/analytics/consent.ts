import {
  CONSENT_STORAGE_KEY,
  EXCLUDE_SESSION_KEY,
  NOTICE_SEEN_KEY,
  type AnalyticsBootstrap,
} from "./contract";

export type PrivacyChoice = "allow" | "deny" | null;

export function readPrivacyChoice(): PrivacyChoice {
  try {
    const raw = window.localStorage.getItem(CONSENT_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { choice?: string };
    if (parsed.choice === "allow" || parsed.choice === "deny") return parsed.choice;
    return null;
  } catch {
    return null;
  }
}

export function writePrivacyChoice(choice: "allow" | "deny"): void {
  try {
    window.localStorage.setItem(
      CONSENT_STORAGE_KEY,
      JSON.stringify({ v: 1, choice, at: new Date().toISOString() }),
    );
  } catch {
    // Preference persistence is best-effort and never an analytics identifier.
  }
}

export function hasGlobalPrivacyOptOut(): boolean {
  const nav = navigator as Navigator & { globalPrivacyControl?: boolean };
  return nav.globalPrivacyControl === true;
}

export function isSessionExcluded(): boolean {
  try {
    return window.sessionStorage.getItem(EXCLUDE_SESSION_KEY) === "1";
  } catch {
    return false;
  }
}

export function excludeCurrentSession(): void {
  try {
    window.sessionStorage.setItem(EXCLUDE_SESSION_KEY, "1");
  } catch {
    // ignore
  }
}

export function noticeSeen(): boolean {
  try {
    return window.localStorage.getItem(NOTICE_SEEN_KEY) === "1";
  } catch {
    return false;
  }
}

export function markNoticeSeen(): void {
  try {
    window.localStorage.setItem(NOTICE_SEEN_KEY, "1");
  } catch {
    // ignore
  }
}

export function collectionAllowed(config: AnalyticsBootstrap): boolean {
  if (!config.enabled || config.killSwitch) return false;
  if (isSessionExcluded()) return false;
  if (hasGlobalPrivacyOptOut()) return false;
  if (config.mode === "strict_consent") return readPrivacyChoice() === "allow";
  if (config.mode === "privacy_first_aggregate") return readPrivacyChoice() !== "deny";
  return false;
}

export function shouldPrompt(config: AnalyticsBootstrap): boolean {
  if (!config.enabled || config.killSwitch) return false;
  if (isSessionExcluded() || hasGlobalPrivacyOptOut()) return false;
  if (config.mode === "strict_consent") return readPrivacyChoice() === null;
  if (config.mode === "privacy_first_aggregate") {
    return readPrivacyChoice() === null && !noticeSeen();
  }
  return false;
}
