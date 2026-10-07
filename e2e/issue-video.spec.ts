import { expect, test, type Page } from "@playwright/test";

// These checks cover what can be verified without a real video upload: the empty state, plain
// file-type feedback, and layout at a phone width. Uploading, processing, playback, replacing,
// and deleting are covered by the service and component tests, because they need the live
// video service.

const uniqueEmail = () =>
  `e2e.video.${Date.now()}.${Math.random().toString(16).slice(2)}@example.com`;

async function signUpAndOnboard(
  page: Page,
  options: { email: string; password: string; workspaceName: string },
) {
  await page.goto("/sign-up");
  await page.getByLabel("First name").fill("E2E");
  await page.getByLabel("Last name").fill("Video");
  await page.getByLabel("Email").fill(options.email);
  await page.locator("#password").fill(options.password);
  await page.locator("#confirmPassword").fill(options.password);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/onboarding/);

  await page.getByLabel("Workspace name").fill(options.workspaceName);
  await page.getByRole("button", { name: "Create your workspace" }).click();
  await expect(page).toHaveURL(/\/dashboard/);
}

test.describe("issue video evidence", () => {
  test("member sees the empty state, gets plain feedback for the wrong file, and has no sideways scroll on a phone", async ({
    page,
    request,
  }) => {
    test.setTimeout(120_000);
    const email = uniqueEmail();
    await signUpAndOnboard(page, {
      email,
      password: "video-passphrase-42",
      workspaceName: "Video E2E Studio",
    });

    const seeded = await request.post("/api/test/seed-review-issue", {
      data: {
        ownerEmail: email,
        createReview: true,
        projectName: "Video Project",
        reviewName: "Homepage video",
        websiteUrl: "https://example.com/start",
        issueBody: "Menu flickers when opening",
        priority: "normal",
        pageRoute: "/menu",
        pageTitle: "Menu",
        screenshotStatus: "ready",
      },
    });
    expect(seeded.ok()).toBeTruthy();
    const payload = (await seeded.json()) as {
      projectId: string;
      reviewId: string;
      issueNumber: number;
    };

    await page.setViewportSize({ width: 320, height: 800 });
    await page.goto(
      `/projects/${payload.projectId}/reviews/${payload.reviewId}/issues/${payload.issueNumber}`,
    );

    await expect(page.getByRole("heading", { level: 2, name: "Video evidence" })).toBeVisible();
    await expect(page.getByText("No video has been added to this issue yet.")).toBeVisible();
    await expect(page.getByText(/up to 3 minutes and 250 MB/).first()).toBeVisible();

    await page.getByLabel("Video file").setInputFiles({
      name: "notes.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("not a video"),
    });
    await expect(
      page.getByText("Choose an MP4, MOV, or WebM video and try again."),
    ).toBeVisible();
    // Nothing raw leaks to the page.
    await expect(page.getByText(/mux|status code|undefined/i)).toHaveCount(0);

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });
});
