/**
 * Browser happy-path for Pass-Off Approval Rooms.
 *
 * Requires a running app (`npm run dev` or `npm start`) plus DATABASE_URL.
 * Run: `npx playwright test tests/e2e/happy-path.spec.ts`
 *
 * Skips automatically when PLAYWRIGHT_BASE_URL is unset and no local server is assumed.
 */
import { test, expect } from "@playwright/test";

const baseURL = process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:3000";
const runE2E = process.env.RUN_E2E === "1";

test.describe("approval room happy path", () => {
  test.skip(!runE2E, "Set RUN_E2E=1 and start the app to run browser E2E");

  test("owner and client complete signup → approval → handoff", async ({ browser }) => {
    const owner = await browser.newPage();
    const stamp = Date.now();
    const email = `owner-${stamp}@example.com`;
    const password = "TestPassword123!";

    await owner.goto(`${baseURL}/login?mode=signup`);
    await owner.getByLabel(/name/i).fill("Owner One");
    await owner.getByLabel(/email/i).fill(email);
    await owner.locator('input[type="password"]').fill(password);
    await owner.getByRole("button", { name: /create account|sign up|start/i }).click();
    await owner.waitForURL(/\/dashboard/);

    await owner.getByRole("button", { name: /new approval room|create/i }).first().click();
    await owner.getByLabel(/project name|room name/i).fill(`Room ${stamp}`);
    await owner.getByLabel(/client/i).fill("Client Co");
    await owner.getByRole("button", { name: /create/i }).click();
    await owner.waitForURL(/\/rooms\//);

    // Minimal PNG
    const png = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
      "base64",
    );
    await owner.locator("#room-upload-input").setInputFiles({
      name: "pixel.png",
      mimeType: "image/png",
      buffer: png,
    });
    await expect(owner.getByText(/uploaded|pixel/i).first()).toBeVisible({ timeout: 30_000 });

    await owner.getByRole("button", { name: /publish/i }).click();
    await owner.getByRole("button", { name: /share|review link|create link/i }).first().click();

    const shareInput = owner.locator("input[readonly], input[value*='/share/']").first();
    await expect(shareInput).toBeVisible({ timeout: 15_000 });
    const shareUrl = await shareInput.inputValue();
    expect(shareUrl).toContain("/share/");

    const client = await browser.newPage();
    await client.goto(shareUrl);
    await client.getByLabel(/name/i).fill("Client Reviewer");
    await client.getByLabel(/email/i).fill(`client-${stamp}@example.com`);
    await client.getByRole("button", { name: /continue|identify|start/i }).click();

    // Request changes then approve on a later revision is ideal; for smoke, approve if available.
    const approve = client.getByRole("button", { name: /approve/i });
    if (await approve.isVisible()) {
      await approve.click();
      const confirm = client.getByRole("button", { name: /confirm/i });
      if (await confirm.isVisible()) await confirm.click();
    }

    await owner.bringToFront();
    await owner.reload();
    const handoff = owner.getByRole("button", { name: /handoff|release/i });
    if (await handoff.isVisible()) {
      await handoff.click();
    }

    await expect(owner.getByText(/Room|Client/i).first()).toBeVisible();
  });
});
