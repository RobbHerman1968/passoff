import { config as loadEnv } from "dotenv";
import "@testing-library/jest-dom/vitest";
import { afterEach, expect } from "vitest";
import { cleanup } from "@testing-library/react";
import { toHaveNoViolations } from "jest-axe";

const hasDom = typeof window !== "undefined";

// Base secrets (AUTH_SECRET, etc.) then test overrides (TEST_DATABASE_URL).
loadEnv({ path: ".env" });
loadEnv({ path: ".env.test" });
loadEnv({ path: ".env.test.local", override: true });

expect.extend(toHaveNoViolations);

afterEach(() => {
  cleanup();
});

if (hasDom) {
  class ResizeObserverMock {
    observe() {}
    unobserve() {}
    disconnect() {}
  }

  if (!globalThis.ResizeObserver) {
    globalThis.ResizeObserver = ResizeObserverMock;
  }

  if (!HTMLElement.prototype.hasPointerCapture) {
    HTMLElement.prototype.hasPointerCapture = () => false;
  }

  if (!HTMLElement.prototype.setPointerCapture) {
    HTMLElement.prototype.setPointerCapture = () => {};
  }

  if (!HTMLElement.prototype.releasePointerCapture) {
    HTMLElement.prototype.releasePointerCapture = () => {};
  }

  if (!HTMLElement.prototype.scrollIntoView) {
    HTMLElement.prototype.scrollIntoView = () => {};
  }

  if (!Element.prototype.scrollTo) {
    Element.prototype.scrollTo = () => {};
  }

  Object.defineProperty(window, "matchMedia", {
    writable: true,
    configurable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }),
  });
}
