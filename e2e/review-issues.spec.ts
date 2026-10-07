import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const uniqueEmail = () =>
  `e2e.issues.${Date.now()}.${Math.random().toString(16).slice(2)}@example.com`;

async function signUpAndOnboard(
  page: Page,
  options: { email: string; password: string; workspaceName: string },
) {
  await page.goto("/sign-up");
  await page.getByLabel("First name").fill("E2E");
  await page.getByLabel("Last name").fill("Issues");
  await page.getByLabel("Email").fill(options.email);
  await page.locator("#password").fill(options.password);
  await page.locator("#confirmPassword").fill(options.password);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/onboarding/);

  await page.getByLabel("Workspace name").fill(options.workspaceName);
  await page.getByRole("button", { name: "Create your workspace" }).click();
  await expect(page).toHaveURL(/\/dashboard/);
}

test.describe("review issue list", () => {
  test("lists seeded issues, opens detail, and stays accessible", async ({
    page,
    request,
  }) => {
    test.setTimeout(120_000);
    const email = uniqueEmail();
    const password = "issues-passphrase-42";

    await signUpAndOnboard(page, {
      email,
      password,
      workspaceName: "Issues E2E Studio",
    });

    const seeded = await request.post("/api/test/seed-review-issue", {
      data: {
        ownerEmail: email,
        createReview: true,
        projectName: "Issue Project",
        reviewName: "Homepage issues",
        websiteUrl: "https://example.com/start",
        issueBody: "Header overlaps navigation on pricing",
        priority: "high",
        pageRoute: "/pricing",
        pageTitle: "Pricing",
        screenshotStatus: "ready",
      },
    });
    expect(seeded.ok()).toBeTruthy();
    const payload = (await seeded.json()) as {
      projectId: string;
      reviewId: string;
      issueNumber: number;
    };

    const reviewPath = `/projects/${payload.projectId}/reviews/${payload.reviewId}`;
    const issuePath = `${reviewPath}/issues/${payload.issueNumber}`;

    await page.goto(`${reviewPath}?q=Header&show=all`);
    await expect(
      page.getByRole("heading", { name: "Issues", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", {
        name: /Issue \d+: Header overlaps navigation on pricing, Open, High priority/i,
      }),
    ).toBeVisible();

    await page
      .getByRole("link", {
        name: /Issue \d+: Header overlaps navigation on pricing, Open, High priority/i,
      })
      .click();
    await expect(page).toHaveURL(new RegExp(`${issuePath.replace(/\//g, "\\/")}(\\?|$)`));
    await expect(
      page.getByRole("heading", {
        level: 1,
        name: "Header overlaps navigation on pricing",
      }),
    ).toBeVisible();
    await expect(page.getByRole("heading", { name: "Feedback" })).toBeVisible();
    await expect(
      page.getByRole("img", {
        name: /captured page context/i,
      }),
    ).toBeVisible();

    await page.setViewportSize({ width: 375, height: 812 });
    await expect(page.getByRole("link", { name: "Back to issues" })).toBeVisible();
    await page.getByRole("link", { name: "Back to issues" }).click();
    await expect(page).toHaveURL(/[?&]q=Header/);
    await expect(page).toHaveURL(/[?&]show=all/);
    await expect(page).not.toHaveURL(/\/issues\/\d+/);
    await expect(
      page.getByRole("link", {
        name: /Issue \d+: Header overlaps navigation on pricing, Open, High priority/i,
      }),
    ).toBeVisible();

    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(`${issuePath}?return=${encodeURIComponent("q=Header&show=all")}`);
    await expect(page.getByLabel("Assignee")).toBeVisible();
    await page.getByLabel("Assignee").click();
    await page.getByRole("option", { name: "E2E Issues" }).click();
    await expect(page.getByText(/assigned this issue to E2E Issues/i)).toBeVisible();

    await page.getByLabel("Priority").click();
    await page.getByRole("option", { name: "Urgent" }).click();
    await expect(page.getByText(/set priority to Urgent/i)).toBeVisible();

    await page.getByRole("button", { name: "Start work" }).click();
    await expect(page.getByText(/changed status from Open to In progress/i)).toBeVisible();
    await page.getByRole("button", { name: "Mark ready for verification" }).click();
    await expect(
      page.getByText(/changed status from In progress to Ready for verification/i),
    ).toBeVisible();

    await page.getByRole("link", { name: "Back to issues" }).click();
    await expect(page).toHaveURL(/[?&]q=Header/);
    await expect(page).toHaveURL(/[?&]show=all/);
    await expect(
      page.getByRole("link", {
        name: /Issue \d+: Header overlaps navigation on pricing, Ready for verification, Urgent priority/i,
      }),
    ).toBeVisible();
    await expect(page.getByText("E2E Issues").first()).toBeVisible();

    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(issuePath);
    await page.getByRole("button", { name: "View full size" }).click();
    await expect(
      page.getByRole("dialog", { name: "Full-size screenshot" }),
    ).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);

    const accessibility = await new AxeBuilder({ page })
      .disableRules(["color-contrast"])
      .analyze();
    expect(accessibility.violations).toEqual([]);
  });
});
