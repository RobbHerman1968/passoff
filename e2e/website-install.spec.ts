import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const uniqueEmail = () =>
  `e2e.install.${Date.now()}.${Math.random().toString(16).slice(2)}@example.com`;

async function signUpAndOnboard(page: Page, options: {
  email: string;
  password: string;
  workspaceName: string;
}) {
  await page.goto("/sign-up");
  await page.getByLabel("First name").fill("E2E");
  await page.getByLabel("Last name").fill("Installer");
  await page.getByLabel("Email").fill(options.email);
  await page.locator("#password").fill(options.password);
  await page.locator("#confirmPassword").fill(options.password);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/onboarding/);

  await page.getByLabel("Workspace name").fill(options.workspaceName);
  await page.getByRole("button", { name: "Create your workspace" }).click();
  await expect(page).toHaveURL(/\/dashboard/);
}

test.describe("website installation workflow", () => {
  test("installs, verifies, stays dormant, disables, and re-enables", async ({
    page,
    baseURL,
  }) => {
    test.setTimeout(90_000);
    const email = uniqueEmail();
    const password = "install-passphrase-42";
    const origin = new URL(baseURL ?? "http://127.0.0.1:3000").origin;
    const websiteUrl = `${origin}/dev/website-sdk/bare`;

    await signUpAndOnboard(page, {
      email,
      password,
      workspaceName: "Install E2E Studio",
    });

    await page.getByRole("button", { name: "Create project" }).first().click();
    const createDialog = page.getByRole("dialog", { name: "Create project" });
    await createDialog.getByLabel("Project name").fill("Install Project");
    await createDialog.getByRole("button", { name: "Create project" }).click();
    await expect(page).toHaveURL(/\/projects\//);

    await page.getByRole("button", { name: "Add review" }).first().click();
    const addReview = page.getByRole("dialog", { name: "Add review" });
    await addReview.getByLabel("Review name").fill("Bare host review");
    await addReview.getByLabel("Website address").fill(websiteUrl);
    await addReview.getByRole("button", { name: "Add review" }).click();

    await expect(
      page.getByRole("heading", { name: "Website setup" }),
    ).toBeVisible();
    const reviewUrl = page.url();

    await page.getByRole("button", { name: "Website setup", exact: true }).click();
    const setup = page.getByRole("dialog", { name: "Website setup" });
    await expect(setup).toBeVisible();

    const snippet = await setup.locator("pre code").innerText();
    expect(snippet).toContain("/sdk/v1/passoff.js");
    expect(snippet).toContain("pk_");
    expect(snippet.toLowerCase()).not.toContain("passoff-prototype-m0");
    expect(snippet.toLowerCase()).not.toContain("session");

    await setup.getByRole("button", { name: "Copy install code" }).click();
    await expect(setup.getByText("Install code copied.")).toBeVisible();

    const keyMatch = snippet.match(/pk_[a-f0-9]{32}/i);
    expect(keyMatch).toBeTruthy();
    const installationKey = keyMatch![0];

    // Close setup and load the production SDK on a representative host page.
    await page.keyboard.press("Escape");
    await page.goto("/dev/website-sdk/bare");
    await expect(page.locator("#hero")).toBeVisible();

    await page.addScriptTag({
      url: "/sdk/v1/passoff.js",
    });
    await page.waitForFunction(
      () => typeof window.Passoff === "function" && typeof window.Passoff.configure === "function",
    );

    const configured = await page.evaluate(async (key) => {
      return window.Passoff!.configure({
        installationKey: key,
        apiBaseUrl: window.location.origin,
        assetBaseUrl: `${window.location.origin}/sdk/v1/`,
      });
    }, installationKey);

    expect(configured.ok).toBe(true);
    expect(configured.verified).toBe(true);
    await expect(page.locator("#passoff-sdk-root")).toHaveCount(0);

    const dormantInit = await page.evaluate(async () => {
      return window.Passoff!.init({});
    });
    expect(dormantInit.active).toBe(false);
    await expect(page.locator("#passoff-sdk-root")).toHaveCount(0);

    // Prototype session must not activate the production artifact.
    const prototypeInit = await page.evaluate(async () => {
      return window.Passoff!.init({ session: "passoff-prototype-m0" });
    });
    expect(prototypeInit.active).toBe(false);
    await expect(page.locator("#passoff-sdk-root")).toHaveCount(0);

    // Host page still works.
    await page.locator("#cta").click();

    // Return to review and confirm Installed.
    await page.goto(reviewUrl);
    await expect(page.getByRole("heading", { name: /Bare host review/ })).toBeVisible();
    await page.getByRole("button", { name: "Website setup", exact: true }).click();
    const setupAgain = page.getByRole("dialog", { name: "Website setup" });
    await setupAgain.getByRole("button", { name: "Check installation" }).click();
    await expect(
      setupAgain.getByRole("definition").filter({ hasText: /^Installed/ }),
    ).toBeVisible({ timeout: 15_000 });

    // Disable Passoff.
    await setupAgain.getByRole("button", { name: "Disable Passoff" }).click();
    const confirm = page.getByRole("alertdialog");
    await confirm.getByRole("button", { name: "Disable Passoff" }).click();
    await expect(
      setupAgain.getByRole("button", { name: "Enable Passoff" }),
    ).toBeVisible();
    await page.keyboard.press("Escape");

    await page.goto("/dev/website-sdk/bare");
    await page.addScriptTag({ url: "/sdk/v1/passoff.js" });
    await page.waitForFunction(
      () => typeof window.Passoff === "function" && typeof window.Passoff.configure === "function",
    );
    const disabledConfig = await page.evaluate(async (key) => {
      return window.Passoff!.configure({
        installationKey: key,
        apiBaseUrl: window.location.origin,
        assetBaseUrl: `${window.location.origin}/sdk/v1/`,
      });
    }, installationKey);
    expect(disabledConfig.status).toBe("disabled");
    await expect(page.locator("#passoff-sdk-root")).toHaveCount(0);
    await page.locator("#cta").click();

    // Re-enable and verify again.
    await page.goto(reviewUrl);
    await page.getByRole("button", { name: "Website setup", exact: true }).click();
    const setupFinal = page.getByRole("dialog", { name: "Website setup" });
    await setupFinal.getByRole("button", { name: "Enable Passoff" }).click();
    await expect(
      setupFinal.getByRole("button", { name: "Disable Passoff" }),
    ).toBeVisible();
    await page.keyboard.press("Escape");

    await page.goto("/dev/website-sdk/bare");
    await page.addScriptTag({ url: "/sdk/v1/passoff.js" });
    await page.waitForFunction(
      () => typeof window.Passoff === "function" && typeof window.Passoff.configure === "function",
    );
    const reenabled = await page.evaluate(async (key) => {
      return window.Passoff!.configure({
        installationKey: key,
        apiBaseUrl: window.location.origin,
        assetBaseUrl: `${window.location.origin}/sdk/v1/`,
      });
    }, installationKey);
    expect(reenabled.verified).toBe(true);
    await expect(page.locator("#passoff-sdk-root")).toHaveCount(0);
  });

  test("website setup stays usable at required widths without page overflow", async ({
    page,
    baseURL,
  }) => {
    test.setTimeout(90_000);
    const email = uniqueEmail();
    const origin = new URL(baseURL ?? "http://127.0.0.1:3000").origin;

    await signUpAndOnboard(page, {
      email,
      password: "install-passphrase-42",
      workspaceName: "Responsive Install Studio",
    });

    await page.getByRole("button", { name: "Create project" }).first().click();
    const createDialog = page.getByRole("dialog", { name: "Create project" });
    await createDialog.getByLabel("Project name").fill("Responsive Install");
    await createDialog.getByRole("button", { name: "Create project" }).click();

    await page.getByRole("button", { name: "Add review" }).first().click();
    const addReview = page.getByRole("dialog", { name: "Add review" });
    await addReview.getByLabel("Review name").fill("Responsive site");
    await addReview
      .getByLabel("Website address")
      .fill(`${origin}/dev/website-sdk/bare`);
    await addReview.getByRole("button", { name: "Add review" }).click();

    for (const width of [320, 375, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await page.getByRole("button", { name: "Website setup", exact: true }).click();
      const setup = page.getByRole("dialog", { name: "Website setup" });
      await expect(setup).toBeVisible();
      const overflow = await page.evaluate(() => {
        const dialog = document.querySelector<HTMLElement>(
          '[data-slot="dialog-content"]',
        );
        if (!dialog) return true;
        // Code may scroll inside the pre; the dialog itself must stay within the viewport.
        return dialog.getBoundingClientRect().width > window.innerWidth + 1;
      });
      expect(overflow).toBe(false);
      await page.keyboard.press("Escape");
    }

    await page.setViewportSize({ width: 1024, height: 900 });
    await page.getByRole("button", { name: "Website setup", exact: true }).click();
    await expect(page.getByRole("dialog", { name: "Website setup" })).toBeVisible();
    const results = await new AxeBuilder({ page })
      .include('[data-slot="dialog-content"]')
      // Overlay compositing can distort axe contrast samples for dialog chrome.
      // Component unit tests cover contrast for this surface.
      .disableRules(["color-contrast"])
      .analyze();
    const serious = results.violations.filter(
      (violation) =>
        violation.impact === "serious" || violation.impact === "critical",
    );
    expect(serious).toEqual([]);
    await page.keyboard.press("Escape");

    // Zoom check is separate from axe: browser zoom can distort computed contrast samples.
    await page.setViewportSize({ width: 720, height: 900 });
    await page.evaluate(() => {
      document.body.style.zoom = "2";
    });
    await page.getByRole("button", { name: "Website setup", exact: true }).click();
    const setupAtZoom = page.getByRole("dialog", { name: "Website setup" });
    await expect(setupAtZoom).toBeVisible();
    const dialogFits = await page.evaluate(() => {
      const dialog = document.querySelector<HTMLElement>(
        '[data-slot="dialog-content"]',
      );
      if (!dialog) return false;
      return dialog.getBoundingClientRect().width <= window.innerWidth + 1;
    });
    expect(dialogFits).toBe(true);
  });
});
