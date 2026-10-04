import { PRIVACY_ATTRIBUTE } from "./types";

const SENSITIVE_INPUT_TYPES = new Set([
  "password",
  "hidden",
  "email",
  "tel",
  "number",
]);

let configuredPrivateSelectors: string[] = [];

export function setPrivateSelectors(selectors: string[] | undefined): void {
  configuredPrivateSelectors = Array.isArray(selectors)
    ? selectors
        .filter((item) => typeof item === "string" && item.trim().length > 0)
        .map((item) => item.trim())
        .slice(0, 50)
    : [];
}

export function getPrivateSelectors(): string[] {
  return configuredPrivateSelectors.slice();
}

function matchesConfiguredPrivateSelector(element: Element): boolean {
  for (const selector of configuredPrivateSelectors) {
    try {
      if (element.matches(selector) || element.closest(selector)) {
        return true;
      }
    } catch {
      // Ignore invalid host-configured selectors.
    }
  }
  return false;
}

export function isPrivateElement(element: Element | null): boolean {
  if (!element) {
    return false;
  }
  if (element.closest(`[${PRIVACY_ATTRIBUTE}]`)) {
    return true;
  }
  if (element instanceof HTMLInputElement && element.type === "password") {
    return true;
  }
  if (matchesConfiguredPrivateSelector(element)) {
    return true;
  }
  return false;
}

export function isSensitiveInput(element: Element | null): boolean {
  if (!element) {
    return false;
  }
  if (element instanceof HTMLInputElement) {
    if (SENSITIVE_INPUT_TYPES.has(element.type)) {
      return true;
    }
    if (element.autocomplete.includes("cc-") || element.autocomplete === "new-password") {
      return true;
    }
  }
  return isPrivateElement(element);
}

export function shouldRedactText(element: Element | null): boolean {
  return isPrivateElement(element) || isSensitiveInput(element);
}

export function redactIfPrivate(value: string, element: Element | null): string {
  return shouldRedactText(element) ? "" : value;
}
