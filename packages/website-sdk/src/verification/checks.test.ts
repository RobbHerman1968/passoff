import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { evaluateVisibility } from "./visibility";
import { evaluateOverlap } from "./overlap";
import { resolveAnchor } from "./resolve";
import {
  clearVerificationHooksForTests,
  registerVerificationCheck,
  runNamedHook,
} from "./hooks";
import { HOOK_TIMEOUT_MS } from "./contract";
import { HOST_ROOT_ID } from "../styles";

describe("deterministic verification checks", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    clearVerificationHooksForTests();
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
      x: 10,
      y: 10,
      top: 10,
      left: 10,
      bottom: 50,
      right: 110,
      width: 100,
      height: 40,
      toJSON() {},
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    clearVerificationHooksForTests();
  });

  it("resolves a stable id and reports missing or ambiguous matches", () => {
    document.body.innerHTML = `<button id="buy">Buy</button>`;
    expect(
      resolveAnchor({
        stableElementId: "buy",
        approvedDataAttributes: {},
        cssSelector: null,
        ancestryFingerprint: null,
      }).status,
    ).toBe("exact");

    document.body.innerHTML = `<button data-testid="x">One</button><button data-testid="x">Two</button>`;
    expect(
      resolveAnchor({
        stableElementId: null,
        approvedDataAttributes: { "data-testid": "x" },
        cssSelector: null,
        ancestryFingerprint: null,
      }).status,
    ).toBe("ambiguous");

    expect(
      resolveAnchor({
        stableElementId: "gone",
        approvedDataAttributes: {},
        cssSelector: null,
        ancestryFingerprint: null,
      }).status,
    ).toBe("missing");
  });

  it("fails visibility for display none, hidden, zero size, and offscreen", () => {
    const visible = document.createElement("button");
    visible.textContent = "Go";
    document.body.append(visible);
    vi.spyOn(window, "getComputedStyle").mockReturnValue({
      display: "block",
      visibility: "visible",
      opacity: "1",
    } as CSSStyleDeclaration);
    document.elementFromPoint = () => visible;
    expect(evaluateVisibility(visible).outcome).toBe("passed");

    const hidden = document.createElement("div");
    hidden.hidden = true;
    document.body.append(hidden);
    expect(evaluateVisibility(hidden).outcome).toBe("failed");
  });

  it("ignores Passoff UI and descendants for overlap, and reports occlusion", () => {
    const target = document.createElement("button");
    target.id = "target";
    document.body.append(target);
    const overlay = document.createElement("div");
    overlay.id = HOST_ROOT_ID;
    overlay.setAttribute("data-passoff-ui", "true");
    document.body.append(overlay);
    document.elementFromPoint = () => overlay;
    const ignored = evaluateOverlap(target);
    expect(ignored.measurements.uncoveredPoints).toBe(ignored.measurements.sampledPoints);
    expect(ignored.outcome).toBe("passed");

    const cover = document.createElement("div");
    cover.setAttribute("role", "dialog");
    document.body.append(cover);
    document.elementFromPoint = () => cover;
    vi.spyOn(window, "getComputedStyle").mockReturnValue({
      position: "fixed",
      visibility: "visible",
      display: "block",
      pointerEvents: "auto",
    } as CSSStyleDeclaration);
    const blocked = evaluateOverlap(target);
    expect(blocked.outcome).toBe("failed");
    expect(blocked.measurements.coverPlacement).toBe("fixed");
  });

  it("runs allowlisted hooks and records uncertain for missing, invalid, timeout, and throw", async () => {
    registerVerificationCheck("checkout-ready", async () => ({
      outcome: "passed",
      summary: "Checkout is ready.",
    }));
    await expect(runNamedHook("checkout-ready", ["checkout-ready"])).resolves.toMatchObject({
      outcome: "passed",
    });

    registerVerificationCheck("checkout-fail", async () => ({
      outcome: "failed",
      summary: "Still broken.",
    }));
    await expect(runNamedHook("checkout-fail", ["checkout-fail"])).resolves.toMatchObject({
      outcome: "failed",
    });

    expect((await runNamedHook("missing-hook", ["missing-hook"])).outcome).toBe("uncertain");
    expect((await runNamedHook("not-listed", ["checkout-ready"])).failureCode).toBe(
      "hook_missing",
    );

    registerVerificationCheck("bad-output", async () => ({ outcome: "maybe" }) as never);
    expect((await runNamedHook("bad-output", ["bad-output"])).outcome).toBe("uncertain");

    registerVerificationCheck("throws", async () => {
      throw new Error("secret stack");
    });
    const thrown = await runNamedHook("throws", ["throws"]);
    expect(thrown.outcome).toBe("uncertain");
    expect(thrown.summary).not.toContain("secret");

    registerVerificationCheck("slow", async () => {
      await new Promise((resolve) => setTimeout(resolve, HOOK_TIMEOUT_MS + 50));
      return { outcome: "passed", summary: "late" };
    });
    vi.useFakeTimers();
    const pending = runNamedHook("slow", ["slow"]);
    await vi.advanceTimersByTimeAsync(HOOK_TIMEOUT_MS + 10);
    const timed = await pending;
    vi.useRealTimers();
    expect(timed.failureCode).toBe("hook_timeout");
    expect(timed.outcome).toBe("uncertain");
  });

  it("treats descendants, pointer-events-none overlays, and sticky covers distinctly", () => {
    const target = document.createElement("button");
    target.id = "pay";
    const child = document.createElement("span");
    child.textContent = "Pay";
    target.append(child);
    document.body.append(target);
    vi.spyOn(window, "getComputedStyle").mockReturnValue({
      position: "static",
      visibility: "visible",
      display: "block",
      pointerEvents: "auto",
    } as CSSStyleDeclaration);
    document.elementFromPoint = () => child;
    expect(evaluateOverlap(target).outcome).toBe("passed");

    const overlay = document.createElement("div");
    overlay.setAttribute("aria-hidden", "true");
    document.body.append(overlay);
    document.elementFromPoint = () => overlay;
    vi.spyOn(window, "getComputedStyle").mockReturnValue({
      position: "fixed",
      visibility: "visible",
      display: "block",
      pointerEvents: "none",
    } as CSSStyleDeclaration);
    const pe = evaluateOverlap(target);
    expect(pe.outcome).toBe("passed");
    expect(pe.measurements.pointerEventsNone).toBe(true);

    const sticky = document.createElement("header");
    document.body.append(sticky);
    document.elementFromPoint = () => sticky;
    vi.spyOn(window, "getComputedStyle").mockReturnValue({
      position: "sticky",
      visibility: "visible",
      display: "block",
      pointerEvents: "auto",
    } as CSSStyleDeclaration);
    const blocked = evaluateOverlap(target);
    expect(blocked.outcome).toBe("failed");
    expect(blocked.measurements.coverPlacement).toBe("sticky");
  });
});
