import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { axe } from "jest-axe";
import { fireEvent } from "@testing-library/dom";

import {
  __getRuntime,
  __resetSdkStateForTests,
  __setReviewLoader,
  installPassoff,
  PROTOTYPE_SESSION_VALUE,
} from "./index";
import { KILL_SWITCH_STORAGE_KEY } from "./types";
import { captureAnchor } from "./anchor";
import { NEARBY_TEXT_LIMIT } from "./types";
import { attemptScreenshot } from "./screenshot";
import { createNavigationTracker } from "./navigation";
import { HOST_ROOT_ID } from "./styles";

async function boot() {
  __resetSdkStateForTests();
  __setReviewLoader(() => import("./review"));
  if (!window.__PASSOFF_SCREENSHOT_LOADER__) {
    window.__PASSOFF_SCREENSHOT_LOADER__ = () => import("./screenshot");
  }
  const api = installPassoff(window);
  return api;
}

function fixturePage() {
  document.title = "Harness";
  document.body.innerHTML = `
    <main>
      <h1 id="hero">Pricing</h1>
      <a href="#gone" id="nav-link">Open details</a>
      <button type="button" id="host-button">Host action</button>
      <p id="copy">Visible paragraph used for nearby text.</p>
      <input id="password" type="password" value="secret-pass" />
      <div data-passoff-private="true" id="private-block">Hidden card number 4242</div>
      <button type="button" id="remove-hero" data-passoff-harness="true">Remove</button>
    </main>
  `;
}

describe("website SDK prototype", () => {
  beforeEach(() => {
    document.documentElement.removeAttribute("data-passoff-disabled");
    window.__PASSOFF_DISABLE__ = false;
    window.localStorage.clear();
    fixturePage();
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      bottom: 24,
      right: 120,
      width: 120,
      height: 24,
      toJSON() {},
    });
  });

  afterEach(() => {
    window.Passoff?.destroy();
    document.getElementById(HOST_ROOT_ID)?.remove();
    delete window.__PASSOFF_SCREENSHOT_LOADER__;
    __resetSdkStateForTests();
    vi.restoreAllMocks();
  });

  it("stays dormant before initialization", async () => {
    const api = await boot();
    expect(document.getElementById(HOST_ROOT_ID)).toBeNull();
    expect(api.getState().active).toBe(false);
    expect(api.getAnchors()).toEqual([]);
  });

  it("does not activate without a prototype session", async () => {
    const api = await boot();
    const result = await api.init({});
    expect(result.active).toBe(false);
    expect(result.reason).toMatch(/review session|configured/i);
    expect(document.getElementById(HOST_ROOT_ID)).toBeNull();
  });

  it("stays visually dormant after configure verification", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, status: "ready" }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const api = await boot();
    const result = await api.configure({
      installationKey: "pk_0123456789abcdef0123456789abcdef",
      apiBaseUrl: "https://embed.example.com",
    });
    expect(result.verified).toBe(true);
    expect(result.status).toBe("ready");
    expect(document.getElementById(HOST_ROOT_ID)).toBeNull();
    expect(api.getState().active).toBe(false);
    expect(api.getState().installationStatus).toBe("ready");
    expect(fetchMock).toHaveBeenCalled();
    const init = await api.init({});
    expect(init.active).toBe(false);
    expect(document.getElementById(HOST_ROOT_ID)).toBeNull();
  });

  it("does not break the host page when configure verification fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("network down")),
    );
    const api = await boot();
    const result = await api.configure({
      installationKey: "pk_0123456789abcdef0123456789abcdef",
    });
    expect(result.ok).toBe(false);
    const clicked = vi.fn();
    document.getElementById("host-button")!.addEventListener("click", clicked);
    document.getElementById("host-button")!.click();
    expect(clicked).toHaveBeenCalled();
    expect(document.getElementById(HOST_ROOT_ID)).toBeNull();
  });

  it("honors disabled installation status from verification", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ ok: true, status: "disabled" }),
      }),
    );
    const api = await boot();
    const configured = await api.configure({
      installationKey: "pk_0123456789abcdef0123456789abcdef",
    });
    expect(configured.status).toBe("disabled");
    const init = await api.init({ session: PROTOTYPE_SESSION_VALUE });
    expect(init.active).toBe(false);
    expect(document.getElementById(HOST_ROOT_ID)).toBeNull();
  });

  it("honors the kill switch", async () => {
    const api = await boot();
    window.localStorage.setItem(KILL_SWITCH_STORAGE_KEY, "on");
    const result = await api.init({ session: PROTOTYPE_SESSION_VALUE });
    expect(result.active).toBe(false);
    expect(result.reason).toMatch(/turned off/i);
    expect(document.getElementById(HOST_ROOT_ID)).toBeNull();
  });

  it("renders isolated UI in Shadow DOM", async () => {
    const api = await boot();
    await api.init({ session: PROTOTYPE_SESSION_VALUE });
    const host = document.getElementById(HOST_ROOT_ID);
    expect(host?.shadowRoot).toBeTruthy();
    const hostile = document.createElement("style");
    hostile.textContent = `* { color: rgb(255, 0, 0) !important; font-size: 80px !important; }`;
    document.head.append(hostile);
    expect(host?.shadowRoot?.querySelector("style")?.textContent).toContain(":host");
    expect(document.querySelector(".toolbar")).toBeNull();
    expect(host!.shadowRoot!.querySelector(".toolbar")).toBeTruthy();
  });

  it("leaves host clicks working in browse mode", async () => {
    const api = await boot();
    await api.init({ session: PROTOTYPE_SESSION_VALUE });
    const clicked = vi.fn();
    document.getElementById("host-button")!.addEventListener("click", clicked);
    document.getElementById("host-button")!.click();
    expect(clicked).toHaveBeenCalledTimes(1);
  });

  it("selects an element with a pointer and captures a privacy-filtered anchor", async () => {
    const api = await boot();
    await api.init({ session: PROTOTYPE_SESSION_VALUE, buildId: "build-22" });
    api.setMode("add-feedback");
    const hero = document.getElementById("hero")!;
    Object.defineProperty(hero, "getBoundingClientRect", {
      configurable: true,
      value: () => ({ left: 10, top: 20, width: 100, height: 40, right: 110, bottom: 60, x: 10, y: 20, toJSON() {} }),
    });
    vi.spyOn(document, "elementsFromPoint").mockReturnValue([hero]);
    fireEvent.pointerDown(hero, { clientX: 20, clientY: 30, bubbles: true });
    await completeFeedback("Move the pricing headline");
    const [anchor] = api.getAnchors();
    expect(anchor.elementTag).toBe("h1");
    expect(anchor.pageTitle).toBe("Harness");
    expect(anchor.stableElementId).toBe("hero");
    expect(anchor.hostBuildId).toBe("build-22");
    expect(anchor.normalizedPosition.x).toBeGreaterThanOrEqual(0);
    expect(anchor.normalizedPosition.x).toBeLessThanOrEqual(1);
    expect(anchor.nearbyVisibleText.length).toBeLessThanOrEqual(NEARBY_TEXT_LIMIT);
    expect(api.getConfirmation()?.description).not.toMatch(/nth-of-type|#hero/);
    const marker = hostMarker(1);
    expect(marker).toHaveAttribute("aria-label", expect.stringMatching(/Issue 1|Feedback 1/));
    Object.defineProperty(hero, "getBoundingClientRect", {
      configurable: true,
      value: () => ({
        left: 80,
        top: 90,
        width: 100,
        height: 40,
        right: 180,
        bottom: 130,
        x: 80,
        y: 90,
        toJSON() {},
      }),
    });
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      callback(0);
      return 1;
    });
    __getRuntime()?.revalidateMarkers();
    await vi.waitFor(() => {
      expect(hostMarker(1).style.left).toBe("90px");
    });
  });

  it("redacts password and privacy-marked content", () => {
    const password = document.getElementById("password")!;
    const privateBlock = document.getElementById("private-block")!;
    const secret = captureAnchor(password, { x: 0, y: 0 });
    const hidden = captureAnchor(privateBlock, { x: 0, y: 0 });
    expect(secret.nearbyVisibleText).toBe("");
    expect(secret.private).toBe(true);
    expect(hidden.nearbyVisibleText).toBe("");
    expect(hidden.accessibleName).toBeNull();
    expect(JSON.stringify(secret)).not.toContain("secret-pass");
    expect(JSON.stringify(hidden)).not.toContain("4242");
  });

  it("cancels keyboard selection with Escape", async () => {
    const api = await boot();
    await api.init({ session: PROTOTYPE_SESSION_VALUE });
    const host = document.getElementById(HOST_ROOT_ID)!;
    const keyboardButton = host.shadowRoot!.querySelectorAll("button")[2] as HTMLButtonElement;
    keyboardButton.click();
    expect(api.getState().mode).toBe("add-feedback");
    fireEvent.keyDown(document, { key: "Escape", bubbles: true });
    expect(api.getState().mode).toBe("browse");
    const clicked = vi.fn();
    document.getElementById("host-button")!.addEventListener("click", clicked);
    document.getElementById("host-button")!.click();
    expect(clicked).toHaveBeenCalled();
  });

  it("confirms keyboard selection with Enter", async () => {
    const api = await boot();
    await api.init({ session: PROTOTYPE_SESSION_VALUE });
    const host = document.getElementById(HOST_ROOT_ID)!;
    const keyboardButton = [...host.shadowRoot!.querySelectorAll("button")].find((button) =>
      button.textContent?.includes("keyboard"),
    ) as HTMLButtonElement;
    keyboardButton.click();
    fireEvent.keyDown(document, { key: "Enter", bubbles: true });
    expect(api.getState().mode).toBe("browse");
    await completeFeedback("Keyboard feedback");
    expect(api.getAnchors().length).toBeGreaterThan(0);
  });

  it("marks removed elements instead of silently moving", async () => {
    const api = await boot();
    await api.init({ session: PROTOTYPE_SESSION_VALUE });
    api.setMode("add-feedback");
    const hero = document.getElementById("hero")!;
    vi.spyOn(document, "elementsFromPoint").mockReturnValue([hero]);
    fireEvent.pointerDown(hero, { clientX: 12, clientY: 12, bubbles: true });
    await completeFeedback("Keep this marker");
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      callback(0);
      return 1;
    });
    hero.remove();
    __getRuntime()?.revalidateMarkers();
    expect(api.getConfirmation()?.title).toMatch(/not found/i);
    expect(hostMarker(1)).toHaveAttribute("aria-label", expect.stringContaining("Original element not found"));
  });

  it("tracks history and hash navigation without double-emitting", () => {
    const tracker = createNavigationTracker(() => undefined);
    const originalPush = history.pushState;
    tracker.start();
    expect(tracker.events.map((event) => event.type)).toEqual(["initial"]);
    history.pushState({}, "", "/sdk-test-a");
    history.replaceState({}, "", "/sdk-test-b");
    window.dispatchEvent(new HashChangeEvent("hashchange"));
    history.pushState({}, "", "/sdk-test-b#section");
    window.dispatchEvent(new PopStateEvent("popstate"));
    tracker.stop();
    expect(history.pushState).toBe(originalPush);
    const types = tracker.events.map((event) => event.type);
    expect(types[0]).toBe("initial");
    expect(types).toContain("pushState");
    expect(types).toContain("replaceState");
    const urls = tracker.events.map((event) => event.currentUrl);
    expect(new Set(urls).size).toBe(urls.length);
  });

  it("does not leak listeners across init/destroy cycles", async () => {
    const api = await boot();
    const add = vi.spyOn(window, "addEventListener");
    await api.init({ session: PROTOTYPE_SESSION_VALUE });
    const first = add.mock.calls.length;
    api.destroy();
    add.mockClear();
    await api.init({ session: PROTOTYPE_SESSION_VALUE });
    expect(add.mock.calls.length).toBe(first);
    expect(document.querySelectorAll(`#${HOST_ROOT_ID}`)).toHaveLength(1);
  });

  it("keeps the captured anchor when screenshot capture is unavailable", async () => {
    window.__PASSOFF_SCREENSHOT_LOADER__ = async () => ({
      attemptScreenshot: async () => ({
        status: "unavailable" as const,
        reason: "Passoff couldn't capture a picture of this page. You can still send your feedback.",
        limitations: ["forced"],
        capturedAt: new Date().toISOString(),
      }),
      SCREENSHOT_FEATURE_LIMITS: [],
    });
    const api = await boot();
    await api.init({ session: PROTOTYPE_SESSION_VALUE });
    api.setMode("add-feedback");
    const hero = document.getElementById("hero")!;
    vi.spyOn(document, "elementsFromPoint").mockReturnValue([hero]);
    fireEvent.pointerDown(hero, { clientX: 10, clientY: 10, bubbles: true });
    await vi.waitFor(() => {
      const status = document
        .getElementById(HOST_ROOT_ID)!
        .shadowRoot!.querySelector(".form-status");
      expect(status?.textContent ?? "").toMatch(/still send your feedback/i);
    });
    await completeFeedback("Still send this");
    expect(api.getAnchors()).toHaveLength(1);
    expect(hostMarker(1)).toBeTruthy();
  });

  it("supports keyboard-only feedback creation with focus restoration", async () => {
    const api = await boot();
    await api.init({ session: PROTOTYPE_SESSION_VALUE });
    const host = document.getElementById(HOST_ROOT_ID)!;
    const addButton = [...host.shadowRoot!.querySelectorAll("button")].find((button) =>
      button.textContent === "Add feedback",
    ) as HTMLButtonElement;
    addButton.focus();
    addButton.click();
    const keyboardButton = [...host.shadowRoot!.querySelectorAll("button")].find((button) =>
      button.textContent?.includes("keyboard"),
    ) as HTMLButtonElement;
    keyboardButton.click();
    fireEvent.keyDown(document, { key: "Enter", bubbles: true });
    await completeFeedback("Keyboard only path");
    expect(api.getConfirmation()?.title).toMatch(/captured|saved/i);
    expect(api.getAnchors()).toHaveLength(1);
  });

  it("does not throw initialization failures into the host", async () => {
    const api = await boot();
    const result = await api.init({
      session: PROTOTYPE_SESSION_VALUE,
      simulateInitFailure: true,
    });
    expect(result.ok).toBe(false);
    const clicked = vi.fn();
    document.getElementById("host-button")!.addEventListener("click", clicked);
    document.getElementById("host-button")!.click();
    expect(clicked).toHaveBeenCalled();
  });

  it("respects reduced motion in isolated styles", async () => {
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      writable: true,
      value: (query: string) => ({
        matches: query.includes("prefers-reduced-motion"),
        media: query,
        addEventListener() {},
        removeEventListener() {},
        addListener() {},
        removeListener() {},
        dispatchEvent() {
          return false;
        },
      }),
    });
    const api = await boot();
    await api.init({ session: PROTOTYPE_SESSION_VALUE });
    expect(api.getState().reducedMotion).toBe(true);
    const css = document.getElementById(HOST_ROOT_ID)!.shadowRoot!.querySelector("style")!.textContent;
    expect(css).toContain("prefers-reduced-motion");
  });

  it("has no serious automated accessibility violations in the prototype UI", async () => {
    const api = await boot();
    await api.init({ session: PROTOTYPE_SESSION_VALUE });
    const surface = document.getElementById(HOST_ROOT_ID)!.shadowRoot!.querySelector(".passoff-root")!;
    const results = await axe(surface as HTMLElement, {
      rules: { "color-contrast": { enabled: false } },
    });
    expect(results).toHaveNoViolations();
  });

  it("reports screenshot limitations without raw exceptions", async () => {
    document.body.innerHTML = `<video id="clip"></video>`;
    const result = await attemptScreenshot({
      element: document.getElementById("clip")!,
      forceUnavailable: true,
    });
    expect(result.status).toBe("unavailable");
    expect(result.reason).not.toMatch(/Error|TypeError|stack/i);
  });
});

function hostMarker(number: number) {
  return document
    .getElementById(HOST_ROOT_ID)!
    .shadowRoot!.querySelectorAll(".marker")
    [number - 1] as HTMLButtonElement;
}

async function completeFeedback(text: string) {
  const root = document.getElementById(HOST_ROOT_ID)!.shadowRoot!;
  const textarea = root.querySelector("#passoff-feedback") as HTMLTextAreaElement;
  const form = root.querySelector(".feedback-form") as HTMLFormElement;
  expect(textarea).toBeTruthy();
  textarea.value = text;
  fireEvent.input(textarea);
  fireEvent.submit(form);
  await vi.waitFor(() => {
    expect(
      document.getElementById(HOST_ROOT_ID)!.shadowRoot!.querySelectorAll(".marker").length,
    ).toBeGreaterThan(0);
  });
}
