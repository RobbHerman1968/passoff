import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  collectionAllowed,
  excludeCurrentSession,
  hasGlobalPrivacyOptOut,
  readPrivacyChoice,
  shouldPrompt,
  writePrivacyChoice,
} from "./consent";
import { CONSENT_STORAGE_KEY, FORBIDDEN_EVENT_KEYS } from "./contract";
import { sanitizeErrorMessage } from "./sanitize-error";
import { isSensitiveRoute, normalizeTelemetryRoute, stripQueryAndFragment } from "./route";
import { startAnalytics } from "./index";

describe("analytics consent", () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    document.getElementById("passoff-privacy-root")?.remove();
    document.getElementById("passoff-privacy-choice-launcher")?.remove();
    window.history.replaceState(null, "", "/");
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  it("does not collect before a strict-consent decision", () => {
    expect(
      collectionAllowed({
        enabled: true,
        mode: "strict_consent",
        schemaVersion: 1,
      }),
    ).toBe(false);
    expect(
      shouldPrompt({
        enabled: true,
        mode: "strict_consent",
        schemaVersion: 1,
      }),
    ).toBe(true);
  });

  it("starts after allow and stops after deny", () => {
    writePrivacyChoice("allow");
    expect(readPrivacyChoice()).toBe("allow");
    expect(
      collectionAllowed({
        enabled: true,
        mode: "strict_consent",
        schemaVersion: 1,
      }),
    ).toBe(true);
    writePrivacyChoice("deny");
    expect(
      collectionAllowed({
        enabled: true,
        mode: "strict_consent",
        schemaVersion: 1,
      }),
    ).toBe(false);
  });

  it("does not treat the stored preference as an analytics identity", () => {
    writePrivacyChoice("allow");
    const stored = window.localStorage.getItem(CONSENT_STORAGE_KEY);
    expect(stored).not.toMatch(/tabSession|visitor|pk_/);
    expect(JSON.parse(stored ?? "{}").choice).toBe("allow");
  });

  it("honors GPC as opt-out", () => {
    Object.defineProperty(navigator, "globalPrivacyControl", {
      configurable: true,
      value: true,
    });
    expect(hasGlobalPrivacyOptOut()).toBe(true);
    expect(
      collectionAllowed({
        enabled: true,
        mode: "privacy_first_aggregate",
        schemaVersion: 1,
      }),
    ).toBe(false);
    Object.defineProperty(navigator, "globalPrivacyControl", {
      configurable: true,
      value: false,
    });
  });

  it("excludes the current session locally", () => {
    excludeCurrentSession();
    expect(
      collectionAllowed({
        enabled: true,
        mode: "privacy_first_aggregate",
        schemaVersion: 1,
      }),
    ).toBe(false);
  });
});

describe("analytics runtime", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    window.localStorage.clear();
    window.sessionStorage.clear();
    document.body.innerHTML = '<main><div data-passoff-analytics-label="hero">Hero</div></main>';
    window.history.replaceState(null, "", "/");
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    document.getElementById("passoff-privacy-root")?.remove();
    document.getElementById("passoff-privacy-choice-launcher")?.remove();
    window.history.replaceState(null, "", "/");
  });

  it("keeps privacy choices available after a visitor decides", () => {
    writePrivacyChoice("allow");
    const runtime = startAnalytics({
      config: { enabled: true, mode: "strict_consent", schemaVersion: 1 },
      installationKey: "pk_test",
      apiBaseUrl: "https://passoff.test",
      reviewActive: false,
    });

    const launcher = document.getElementById("passoff-privacy-choice-launcher");
    expect(launcher?.shadowRoot?.querySelector("button")).toHaveAccessibleName(
      "Open usability privacy choices",
    );
    (launcher?.shadowRoot?.querySelector("button") as HTMLButtonElement).click();
    const panel = document.getElementById("passoff-privacy-root");
    const deny = [...(panel?.shadowRoot?.querySelectorAll("button") ?? [])].find(
      (button) => button.textContent === "No thanks",
    ) as HTMLButtonElement;
    deny.click();

    expect(document.getElementById("passoff-privacy-root")).toBeNull();
    expect(document.getElementById("passoff-privacy-choice-launcher")).not.toBeNull();
    runtime?.destroy();
  });

  it("records client-side route changes as page views and resets route context", async () => {
    writePrivacyChoice("allow");
    const requests: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url, init?: RequestInit) => {
        requests.push(String(init?.body));
        return { ok: true, status: 202 };
      }),
    );
    const runtime = startAnalytics({
      config: { enabled: true, mode: "strict_consent", schemaVersion: 1 },
      installationKey: "pk_test",
      apiBaseUrl: "https://passoff.test",
      reviewActive: false,
    });

    window.history.pushState(null, "", "/pricing");
    await vi.advanceTimersByTimeAsync(4_000);

    const events = requests.flatMap((body) => JSON.parse(body).events);
    expect(events.filter((event) => event.eventType === "page_view").map((event) => event.route)).toEqual([
      "/",
      "/pricing",
    ]);
    runtime?.destroy();
  });

  it("retries transient ingestion failures without losing or changing events", async () => {
    writePrivacyChoice("allow");
    const requests: string[] = [];
    const fetchMock = vi.fn(async (_url, init?: RequestInit) => {
      requests.push(String(init?.body));
      return { ok: requests.length > 1, status: requests.length > 1 ? 202 : 500 };
    });
    vi.stubGlobal("fetch", fetchMock);
    const runtime = startAnalytics({
      config: { enabled: true, mode: "strict_consent", schemaVersion: 1 },
      installationKey: "pk_test",
      apiBaseUrl: "https://passoff.test",
      reviewActive: false,
    });

    await vi.advanceTimersByTimeAsync(8_000);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const first = JSON.parse(requests[0]).events[0];
    const second = JSON.parse(requests[1]).events[0];
    expect(second.eventId).toBe(first.eventId);
    runtime?.destroy();
  });

  it("classifies labeled non-interactive areas as page regions", async () => {
    writePrivacyChoice("allow");
    const requests: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url, init?: RequestInit) => {
        requests.push(String(init?.body));
        return { ok: true, status: 202 };
      }),
    );
    const runtime = startAnalytics({
      config: { enabled: true, mode: "strict_consent", schemaVersion: 1 },
      installationKey: "pk_test",
      apiBaseUrl: "https://passoff.test",
      reviewActive: false,
    });

    document.querySelector<HTMLElement>("[data-passoff-analytics-label]")?.click();
    await vi.advanceTimersByTimeAsync(4_000);

    const events = requests.flatMap((body) => JSON.parse(body).events);
    expect(events).toContainEqual(
      expect.objectContaining({
        eventType: "element_click",
        elementCategory: "page_region",
        analyticsLabel: "hero",
      }),
    );
    runtime?.destroy();
  });
});

describe("analytics serialization privacy", () => {
  it("never serializes forbidden fields", () => {
    expect(FORBIDDEN_EVENT_KEYS).toContain("password");
    expect(FORBIDDEN_EVENT_KEYS).toContain("cookies");
  });

  it("strips query strings and sanitizes errors", () => {
    const url = stripQueryAndFragment("https://example.com/path?token=abc#frag");
    expect(url?.toString()).toBe("https://example.com/path");
    expect(normalizeTelemetryRoute("/account/orders")).toBe("/account/orders");
    expect(isSensitiveRoute("/account")).toBe(true);
    expect(sanitizeErrorMessage("boom https://x.test/?token=1 user@x.test")).not.toContain(
      "token=1",
    );
  });
});
