import { expect, test, type Page } from "@playwright/test";

// Playing a video needs the live video service, so these checks cover what a fixture can show:
// notes that belong to an earlier video, the discussion link, and layout on a phone. Pins,
// timeline markers, pausing, and saving a note are covered by the component and service tests.

const uniqueEmail = () =>
  `e2e.videonotes.${Date.now()}.${Math.random().toString(16).slice(2)}@example.com`;

async function signUpAndOnboard(page: Page, email: string) {
  await page.goto("/sign-up");
  await page.getByLabel("First name").fill("E2E");
  await page.getByLabel("Last name").fill("Notes");
  await page.getByLabel("Email").fill(email);
  await page.locator("#password").fill("video-notes-passphrase-42");
  await page.locator("#confirmPassword").fill("video-notes-passphrase-42");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/onboarding/);
  await page.getByLabel("Workspace name").fill(`Video Notes Studio ${Date.now()}${Math.random().toString(16).slice(2, 6)}`);
  await page.getByRole("button", { name: "Create your workspace" }).click();
  await expect(page).toHaveURL(/\/dashboard/);
}

test.describe("time-based video notes", () => {
  test("notes on an earlier video stay readable, are clearly labeled, and fit a phone", async ({
    page,
    request,
  }) => {
    test.setTimeout(120_000);
    const email = uniqueEmail();
    await signUpAndOnboard(page, email);

    const seeded = await request.post("/api/test/seed-review-issue", {
      data: {
        ownerEmail: email,
        createReview: true,
        projectName: "Notes Project",
        reviewName: "Checkout video",
        websiteUrl: "https://example.com/start",
        issueBody: "Button label wraps badly",
        pageRoute: "/checkout",
        pageTitle: "Checkout",
        earlierVideoNote: { timestampMs: 12_000, body: "The label wraps right here" },
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

    // In the video section: the note sits under a clear "no longer here" heading.
    await expect(
      page.getByRole("heading", { name: /Notes from videos that are no longer here \(1\)/ }),
    ).toBeVisible();
    await expect(page.getByText(/belong to an earlier or removed video/)).toBeVisible();
    await expect(page.getByText("Earlier video", { exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Note 1 at 0:12" })).toBeVisible();

    // No way to jump to or add a note without a playable video.
    await expect(page.getByRole("button", { name: /Go to note/ })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Add note at this time" })).toHaveCount(0);

    // In the discussion: the same note, with the same honest label.
    await expect(page.getByText(/Note at 0:12 on an earlier video/)).toBeVisible();

    // No sideways scrolling at 320 pixels wide.
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);

    // Nothing raw leaks to the page.
    const text = await page.locator("body").innerText();
    expect(text).not.toMatch(/stack|undefined|\[object|playback_|asset_/i);
  });

  test("an issue with no video offers no note button and explains where to start", async ({
    page,
    request,
  }) => {
    test.setTimeout(120_000);
    const email = uniqueEmail();
    await signUpAndOnboard(page, email);
    const seeded = await request.post("/api/test/seed-review-issue", {
      data: {
        ownerEmail: email,
        createReview: true,
        projectName: "Empty Notes Project",
        reviewName: "No video",
        websiteUrl: "https://example.com/start",
        issueBody: "Nothing recorded yet",
      },
    });
    const payload = (await seeded.json()) as {
      projectId: string;
      reviewId: string;
      issueNumber: number;
    };
    await page.goto(
      `/projects/${payload.projectId}/reviews/${payload.reviewId}/issues/${payload.issueNumber}`,
    );
    await expect(page.getByText("No video has been added to this issue yet.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Add note at this time" })).toHaveCount(0);
  });
});
