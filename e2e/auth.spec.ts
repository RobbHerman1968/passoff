import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import { signOut } from "./helpers";

const uniqueEmail = () =>
  `e2e.${Date.now()}.${Math.random().toString(16).slice(2)}@example.com`;

async function expectNoA11yViolations(page: Page, path: string) {
  await page.goto(path);
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual(
    [],
  );
}

test.describe("account authentication", () => {
  test("account pages pass automated accessibility checks", async ({ page }) => {
    await expectNoA11yViolations(page, "/sign-in");
    await expectNoA11yViolations(page, "/sign-up");
    await expectNoA11yViolations(page, "/forgot-password");
    await expectNoA11yViolations(page, "/reset-password");
  });

  test("credentials signup, onboarding, dashboard, sign-out, reset", async ({
    page,
    request,
  }) => {
    const email = uniqueEmail();
    const password = "initial-passphrase-42";
    const nextPassword = "rotated-passphrase-99";

    await page.goto("/sign-up");
    await page.getByLabel("First name").fill("E2E");
    await page.getByLabel("Last name").fill("Reviewer");
    await page.getByLabel("Email").fill(email);
    await page.locator("#password").fill(password);
    await page.locator("#confirmPassword").fill(password);
    await page.getByRole("button", { name: "Create account" }).click();

    await expect(page).toHaveURL(/\/onboarding/);
    await expect(page.getByRole("heading", { name: "Create your workspace" })).toBeVisible();

    await page.getByLabel("Workspace name").fill("E2E Studio");
    await page.getByRole("button", { name: "Create your workspace" }).click();

    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page.getByRole("heading", { name: "Projects", exact: true })).toBeVisible();
    await expect(page.getByText("E2E Studio").first()).toBeVisible();
    await expect(page.getByText("No projects yet")).toBeVisible();

    await signOut(page);
    await expect(page).toHaveURL(/\/sign-in/);

    await page.getByLabel("Email").fill(email);
    await page.locator("#password").fill(password);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/\/dashboard/);

    await signOut(page);
    await expect(page).toHaveURL(/\/sign-in/);

    await page.goto("/forgot-password");
    await page.getByLabel("Email").fill(email);
    await page.getByRole("button", { name: "Send reset link" }).click();
    await expect(
      page.getByText(
        "If an account matches that email, we’ll send a password reset link.",
      ),
    ).toBeVisible();

    // Create a dedicated reset token through the test transport boundary.
    // The UI forgot-password step already verified the generic accepted state.
    const resetResponse = await request.post("/api/test/create-reset-token", {
      data: { email },
    });
    expect(resetResponse.ok()).toBeTruthy();
    const { path: resetPath } = (await resetResponse.json()) as {
      path: string | null;
    };

    expect(resetPath).toBeTruthy();
    await page.goto(resetPath!);
    await expect(page.getByRole("heading", { name: "Reset password" })).toBeVisible();
    await page.locator("#password").fill(nextPassword);
    await page.locator("#confirmPassword").fill(nextPassword);
    await page.getByRole("button", { name: "Set new password" }).click();
    await expect(page.getByText("Password updated")).toBeVisible();

    await page.goto("/sign-in");
    await page.getByLabel("Email").fill(email);
    await page.locator("#password").fill(password);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(
      page.getByText(
        "We couldn’t sign you in. Check your email and password and try again.",
      ),
    ).toBeVisible();

    await page.locator("#password").fill(nextPassword);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/\/dashboard/);

    await signOut(page);
    await expect(page).toHaveURL(/\/sign-in/);

    await page.goto(resetPath!);
    await expect(page.getByText("This reset link is no longer valid.")).toBeVisible();
  });

  test("protected routes redirect unauthenticated visitors", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/sign-in/);
    await page.goto("/onboarding");
    await expect(page).toHaveURL(/\/sign-in/);
  });

  test("OAuth buttons remain visible with provider names", async ({ page }) => {
    await page.goto("/sign-in");
    await expect(
      page.getByRole("button", { name: "Continue with Google" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Continue with GitHub" }),
    ).toBeVisible();
  });
});
