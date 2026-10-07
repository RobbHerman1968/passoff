import { expect, test, type Page } from "@playwright/test";

const uniqueEmail = () =>
  `e2e.discussion.${Date.now()}.${Math.random().toString(16).slice(2)}@example.com`;

async function signUpAndOnboard(
  page: Page,
  options: { email: string; password: string; workspaceName: string },
) {
  await page.goto("/sign-up");
  await page.getByLabel("First name").fill("E2E");
  await page.getByLabel("Last name").fill("Discussion");
  await page.getByLabel("Email").fill(options.email);
  await page.locator("#password").fill(options.password);
  await page.locator("#confirmPassword").fill(options.password);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/onboarding/);

  await page.getByLabel("Workspace name").fill(options.workspaceName);
  await page.getByRole("button", { name: "Create your workspace" }).click();
  await expect(page).toHaveURL(/\/dashboard/);
}

test.describe("issue discussion", () => {
  test("member adds a public reply and a private note", async ({
    page,
    request,
  }) => {
    test.setTimeout(120_000);
    const email = uniqueEmail();
    const password = "discussion-passphrase-42";

    await signUpAndOnboard(page, {
      email,
      password,
      workspaceName: "Discussion E2E Studio",
    });

    const seeded = await request.post("/api/test/seed-review-issue", {
      data: {
        ownerEmail: email,
        createReview: true,
        projectName: "Discussion Project",
        reviewName: "Homepage discussion",
        websiteUrl: "https://example.com/start",
        issueBody: "Checkout button overlaps the footer",
        priority: "normal",
        pageRoute: "/checkout",
        pageTitle: "Checkout",
        screenshotStatus: "ready",
      },
    });
    expect(seeded.ok()).toBeTruthy();
    const payload = (await seeded.json()) as {
      projectId: string;
      reviewId: string;
      issueNumber: number;
    };

    const issuePath = `/projects/${payload.projectId}/reviews/${payload.reviewId}/issues/${payload.issueNumber}`;
    await page.goto(issuePath);

    await expect(
      page.getByRole("heading", { name: "Discussion" }),
    ).toBeVisible();
    await expect(page.getByText("No replies yet")).toBeVisible();

    const reply = page.getByRole("textbox", { name: "Reply" });
    await reply.fill("I can reproduce this on mobile.");
    await page.getByRole("radio", { name: /Public reply/i }).check();
    await page.getByRole("button", { name: "Add reply" }).click();
    await expect(page.getByTestId("discussion-status")).toContainText(
      "Reply added.",
    );
    await expect(
      page.getByText("I can reproduce this on mobile."),
    ).toBeVisible();

    await reply.fill("Internal: assign to Maya after lunch.");
    await page.getByRole("radio", { name: /Private note/i }).check();
    await page.getByRole("button", { name: "Add private note" }).click();
    await expect(page.getByTestId("discussion-status")).toContainText(
      "Private note added.",
    );
    await expect(
      page.getByText("Internal: assign to Maya after lunch."),
    ).toBeVisible();
    await expect(page.getByText("Private note").first()).toBeVisible();
  });
});
