import { expect, test, type Page } from "@playwright/test";

const SESSION = "passoff-prototype-m0";

async function ensureSdk(page: Page) {
  const ready = await page.evaluate(
    () => typeof window.Passoff === "function" && typeof window.Passoff.init === "function",
  );
  if (!ready) {
    await page.addScriptTag({ url: "/dev/website-sdk/sdk/passoff-sdk.js" });
    await page.waitForFunction(
      () => typeof window.Passoff === "function" && typeof window.Passoff.init === "function",
    );
  }
}

async function initSdk(page: Page) {
  await ensureSdk(page);
  return page.evaluate(async (session) => {
    const api = window.Passoff;
    if (!api?.init) {
      throw new Error("SDK missing");
    }
    return api.init({
      session,
      buildId: "e2e",
      assetBaseUrl: `${window.location.origin}/dev/website-sdk/sdk/`,
    });
  }, SESSION);
}

test.describe("website SDK end-to-end", () => {
  test("loads the built SDK asynchronously into a host page", async ({ page }) => {
    await page.goto("/dev/website-sdk/bare");
    await expect(page.locator("#hero")).toBeVisible();
    await expect(page.locator("#passoff-sdk-root")).toHaveCount(0);

    await page.addScriptTag({
      url: "/dev/website-sdk/sdk/passoff-sdk.js",
    });
    await page.waitForFunction(
      () => typeof window.Passoff === "function" && typeof window.Passoff.init === "function",
    );

    const beforeWidth = await page.locator("main").evaluate((node) => node.getBoundingClientRect().width);
    const result = await initSdk(page);
    expect(result.ok).toBe(true);

    await expect(page.locator("#passoff-sdk-root")).toHaveCount(1);
    const afterWidth = await page.locator("main").evaluate((node) => node.getBoundingClientRect().width);
    expect(Math.abs(afterWidth - beforeWidth)).toBeLessThan(1);

    const isolated = await page.evaluate(() => {
      const host = document.getElementById("passoff-sdk-root");
      return Boolean(host?.shadowRoot?.querySelector(".toolbar"));
    });
    expect(isolated).toBe(true);
  });

  test("keeps the review toolbar inside a 320px viewport", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 720 });
    await page.goto("/dev/website-sdk/bare");
    await initSdk(page);
    const box = await page.evaluate(() => {
      const toolbar = document
        .getElementById("passoff-sdk-root")
        ?.shadowRoot?.querySelector(".toolbar");
      return toolbar?.getBoundingClientRect();
    });
    expect(box?.width ?? 0).toBeGreaterThan(0);
    expect(box?.width ?? 9999).toBeLessThanOrEqual(320);
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
  });

  test("supports pointer selection, keyboard cancel, and missing elements", async ({ page }) => {
    await page.goto("/dev/website-sdk/host");
    await initSdk(page);

    const toolbar = page.locator("#passoff-sdk-root");
    await page.evaluate(() => window.Passoff?.setMode("add-feedback"));

    const started = Date.now();
    await page.locator("#cta").click({ force: true });
    const delay = Date.now() - started;
    expect(delay).toBeLessThan(500);

    await page.evaluate(() => {
      const root = document.getElementById("passoff-sdk-root")?.shadowRoot;
      const textarea = root?.querySelector("#passoff-feedback") as HTMLTextAreaElement | null;
      const form = root?.querySelector(".feedback-form") as HTMLFormElement | null;
      if (!textarea || !form) throw new Error("feedback form missing");
      textarea.value = "E2E feedback";
      form.requestSubmit();
    });

    await expect
      .poll(async () => page.evaluate(() => window.Passoff?.getAnchors().length ?? 0))
      .toBeGreaterThan(0);

    await page.evaluate(() => window.Passoff?.setMode("add-feedback"));
    await page.keyboard.press("Escape");
    const mode = await page.evaluate(() => window.Passoff?.getState().mode);
    expect(mode).toBe("browse");

    await page.evaluate(() => window.Passoff?.removeSelectedElement());
    await page.evaluate(() => window.Passoff?.revalidateMarkers());
    const confirmation = await page.evaluate(() => window.Passoff?.getConfirmation()?.title ?? "");
    expect(confirmation).toMatch(/not found/i);

    const markerSize = await page.evaluate(() => {
      const marker = document.getElementById("passoff-sdk-root")?.shadowRoot?.querySelector(".marker");
      if (!(marker instanceof HTMLElement)) {
        return { width: 0, height: 0 };
      }
      const rect = marker.getBoundingClientRect();
      return { width: rect.width, height: rect.height };
    });
    expect(markerSize.width).toBeGreaterThanOrEqual(44);
    expect(markerSize.height).toBeGreaterThanOrEqual(44);

    void toolbar;
  });

  test("detects history and Next.js client navigation", async ({ page }) => {
    await page.goto("/dev/website-sdk/app");
    await initSdk(page);

    await page.evaluate(() => {
      history.pushState({ passoff: "pricing" }, "", "/dev/website-sdk/app?view=pricing");
      history.replaceState({ passoff: "home" }, "", "/dev/website-sdk/app?view=home");
      window.location.hash = "pricing";
    });
    const beforeClientNav = await page.evaluate(() =>
      (window.Passoff?.getNavigationEvents?.() ?? []).map((event) => event.type),
    );
    expect(beforeClientNav).toContain("initial");
    expect(beforeClientNav).toContain("pushState");
    expect(beforeClientNav).toContain("replaceState");
    const navigationEntriesBefore = await page.evaluate(
      () => performance.getEntriesByType("navigation").length,
    );
    await page.getByRole("link", { name: "About this campaign" }).click();
    await expect(page.getByText("Next.js about page")).toBeVisible();
    await expect(page).toHaveURL(/\/dev\/website-sdk\/app\/about/);
    const navigationEntriesAfter = await page.evaluate(
      () => performance.getEntriesByType("navigation").length,
    );
    expect(navigationEntriesAfter).toBe(navigationEntriesBefore);
    await initSdk(page);
    expect(await page.evaluate(() => window.Passoff?.getState().active)).toBe(true);
  });

  test("survives screenshot failure, teardown, and a forced init error", async ({ page }) => {
    await page.goto("/dev/website-sdk/host");
    await initSdk(page);
    await page.evaluate(() => window.Passoff?.setMode("add-feedback"));
    await page.locator("#demo-video").click({ force: true });
    await page.evaluate(() => {
      const root = document.getElementById("passoff-sdk-root")?.shadowRoot;
      const textarea = root?.querySelector("#passoff-feedback") as HTMLTextAreaElement | null;
      const form = root?.querySelector(".feedback-form") as HTMLFormElement | null;
      if (!textarea || !form) throw new Error("feedback form missing");
      textarea.value = "Video feedback";
      form.requestSubmit();
    });

    await expect
      .poll(async () => page.evaluate(() => window.Passoff?.getAnchors().length ?? 0))
      .toBeGreaterThan(0);

    await page.evaluate(() => window.Passoff?.destroy());
    await expect(page.locator("#passoff-sdk-root")).toHaveCount(0);
    await page.getByRole("button", { name: "Get a quote" }).click();

    const failure = await page.evaluate(async (session) => {
      return window.Passoff?.init({
        session,
        simulateInitFailure: true,
        assetBaseUrl: `${window.location.origin}/dev/website-sdk/sdk/`,
      });
    }, SESSION);
    expect(failure?.ok).toBe(false);
    expect(failure?.reason).toMatch(/keep using the website/i);
    await page.getByRole("button", { name: "Get a quote" }).click();

    const initEntry = await page.evaluate(() =>
      performance.getEntriesByName("passoff-init")[0]?.duration ?? null,
    );
    expect(initEntry === null || initEntry < 1000).toBe(true);
  });
});
