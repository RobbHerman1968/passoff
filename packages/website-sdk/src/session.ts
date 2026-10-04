import { ALLOW_PROTOTYPE_SESSION } from "./build-flags";
import {
  KILL_SWITCH_STORAGE_KEY,
  PROTOTYPE_SESSION_VALUE,
  type PassoffConfigureConfig,
  type PassoffInitConfig,
} from "./types";

export function isKillSwitchOn(
  config?: PassoffInitConfig | PassoffConfigureConfig,
): boolean {
  if (config?.disabled) {
    return true;
  }
  if (typeof window === "undefined") {
    return false;
  }
  if ((window as Window & { __PASSOFF_DISABLE__?: boolean }).__PASSOFF_DISABLE__) {
    return true;
  }
  if (document.documentElement.hasAttribute("data-passoff-disabled")) {
    return true;
  }
  try {
    return window.localStorage.getItem(KILL_SWITCH_STORAGE_KEY) === "on";
  } catch {
    return false;
  }
}

export function hasActivePrototypeSession(config?: PassoffInitConfig): boolean {
  const session = config?.session?.trim();
  return session === PROTOTYPE_SESSION_VALUE;
}

export function hasAuthorizedReviewSession(config?: PassoffInitConfig): boolean {
  return Boolean(config?.sessionToken?.trim());
}

export function describeInitBlock(config?: PassoffInitConfig): string | null {
  if (isKillSwitchOn(config)) {
    return "Passoff is turned off for this website.";
  }
  if (hasAuthorizedReviewSession(config)) {
    return null;
  }
  if (hasActivePrototypeSession(config)) {
    if (!ALLOW_PROTOTYPE_SESSION) {
      return "Passoff stays off until a review session is active.";
    }
    return null;
  }
  return "Passoff stays off until a review session is active.";
}

export function describeConfigureBlock(
  config?: PassoffConfigureConfig,
): string | null {
  if (isKillSwitchOn(config)) {
    return "Passoff is turned off for this website.";
  }
  return null;
}
