import { expect, test, type Page } from "@playwright/test";

const uniqueEmail = () =>
  `e2e.approvals.${Date.now()}.${Math.random().toString(16).slice(2)}@example.com`;

async function signUpAndOnboard(
  page: Page,
  options: { email: string; password: string; workspaceName: string },
) {
  await page.goto("/sign-up");
  await page.getByLabel("First name").fill("E2E");
  await page.getByLabel("Last name").fill("Approvals");
  await page.getByLabel("Email").fill(options.email);
  await page.locator("#password").fill(options.password);
  await page.locator("#confirmPassword").fill(options.password);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/onboarding/);

  await page.getByLabel("Workspace name").fill(options.workspaceName);
  await page.getByRole("button", { name: "Create your workspace" }).click();
  await expect(page).toHaveURL(/\/dashboard/);
}

test.describe("deployment-specific approvals", () => {
  test("a teammate asks for approval, decides, and sees it tied to the version", async ({
    page,
    request,
  }) => {
    test.setTimeout(120_000);
    const email = uniqueEmail();
    await signUpAndOnboard(page, {
      email,
      password: "approvals-passphrase-42",
      workspaceName: "Approvals E2E Studio",
    });

    const seeded = await request.post("/api/test/seed-review-issue", {
      data: {
        ownerEmail: email,
        createReview: true,
        projectName: "Approvals Project",
        reviewName: "Homepage approval",
        websiteUrl: "https://example.com/start",
        issueBody: "Hero image is cropped on mobile",
        priority: "normal",
        screenshotStatus: "ready",
      },
    });
    expect(seeded.ok()).toBeTruthy();
    const payload = (await seeded.json()) as { projectId: string; reviewId: string };

    await page.goto(`/projects/${payload.projectId}/reviews/${payload.reviewId}`);
    const panel = page.getByTestId("approval-panel");
    await expect(panel.getByRole("heading", { name: "Approval" })).toBeVisible();
    await expect(panel).toContainText("Approval not requested");

    // One open issue remains, so the request needs an explicit acknowledgment.
    await panel.getByRole("button", { name: "Ask for approval" }).click();
    const requestDialog = page.getByRole("dialog");
    await requestDialog.getByRole("button", { name: "Send approval request" }).click();
    await expect(requestDialog).toContainText("Confirm that you understand");
    await requestDialog.getByRole("checkbox").check();
    await requestDialog.getByLabel("Message (optional)").fill("Please check the hero image.");
    await requestDialog.getByRole("button", { name: "Send approval request" }).click();
    await expect(requestDialog).toBeHidden();

    await expect(panel).toContainText("Waiting for approval on");
    await expect(panel).toContainText("Please check the hero image.");

    // Requesting changes needs a note.
    await panel.getByRole("button", { name: "Request changes" }).click();
    const changesDialog = page.getByRole("dialog");
    await changesDialog.getByRole("button", { name: "Send change request" }).click();
    await expect(changesDialog).toContainText("Tell the team what needs to change");
    await changesDialog.getByRole("button", { name: "Not now" }).click();

    await panel.getByRole("button", { name: "Approve this review" }).click();
    const approveDialog = page.getByRole("dialog");
    await approveDialog.getByLabel("Note (optional)").fill("Looks right to me.");
    await approveDialog.getByRole("button", { name: "Approve this version" }).click();
    await expect(approveDialog).toBeHidden();

    await expect(panel).toContainText("Approved for");
    await expect(panel).toContainText("Looks right to me.");
    await expect(panel.getByRole("heading", { name: "Approval history" })).toBeVisible();
  });

  test("share links can allow guests to approve", async ({ page, request }) => {
    test.setTimeout(120_000);
    const email = uniqueEmail();
    await signUpAndOnboard(page, {
      email,
      password: "approvals-passphrase-42",
      workspaceName: "Approvals Share Studio",
    });
    const seeded = await request.post("/api/test/seed-review-issue", {
      data: {
        ownerEmail: email,
        createReview: true,
        projectName: "Approvals Share Project",
        reviewName: "Share approval",
        websiteUrl: "https://example.com/start",
        issueBody: "Footer link is hard to read",
        screenshotStatus: "ready",
      },
    });
    expect(seeded.ok()).toBeTruthy();
    const payload = (await seeded.json()) as { projectId: string; reviewId: string };

    await page.goto(`/projects/${payload.projectId}/reviews/${payload.reviewId}`);
    await page.getByRole("button", { name: "Share review" }).click();
    const share = page.getByRole("dialog");
    await share.getByRole("switch", { name: "Approve or request changes" }).click();
    await share.getByRole("button", { name: "Create guest link" }).click();
    await expect(share).toContainText("Share link ready");
    await expect(share.getByRole("list")).toContainText(/can approve/i);
  });
});
