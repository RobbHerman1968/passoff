import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import { breadcrumb, openFromList, signOut } from "./helpers";

const uniqueEmail = () =>
  `e2e.projects.${Date.now()}.${Math.random().toString(16).slice(2)}@example.com`;

async function signUpAndOnboard(page: Page, options: {
  email: string;
  password: string;
  workspaceName: string;
}) {
  await page.goto("/sign-up");
  await page.getByLabel("First name").fill("E2E");
  await page.getByLabel("Last name").fill("Owner");
  await page.getByLabel("Email").fill(options.email);
  await page.locator("#password").fill(options.password);
  await page.locator("#confirmPassword").fill(options.password);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/onboarding/);

  await page.getByLabel("Workspace name").fill(options.workspaceName);
  await page.getByRole("button", { name: "Create your workspace" }).click();
  await expect(page).toHaveURL(/\/dashboard/);
}

// The menu can close again if the page finishes loading just after it opens, so open it until the
// item is really there, then choose it.
async function chooseFromActions(page: Page, buttonName: string, itemName: string) {
  const item = page.getByRole("menuitem", { name: itemName });
  await expect(async () => {
    if (!(await item.isVisible())) {
      await page.getByRole("button", { name: buttonName }).click();
    }
    await item.click({ timeout: 3_000 });
  }).toPass({ timeout: 30_000 });
}

test.describe("project and review management", () => {
  test("owner can manage projects and reviews end to end", async ({
    page,
    request,
  }) => {
    test.setTimeout(90_000);
    const ownerEmail = uniqueEmail();
    const memberEmail = uniqueEmail();
    const password = "project-passphrase-42";
    const workspaceName = "Projects E2E Studio";
    const projectName = "Acme Launch";
    const renamedProject = "Acme Launch Renamed";
    const websiteReview = "Homepage review";
    const renamedReview = "Homepage review v2";

    await signUpAndOnboard(page, {
      email: ownerEmail,
      password,
      workspaceName,
    });

    await expect(page.getByText("No projects yet")).toBeVisible();

    // Create from empty-state action.
    await page.getByRole("button", { name: "Create project" }).first().click();
    const createDialog = page.getByRole("dialog", { name: "Create project" });
    await expect(createDialog).toBeVisible();
    await createDialog.getByLabel("Project name").fill(projectName);
    await createDialog.getByRole("button", { name: "Create project" }).click();

    await expect(page).toHaveURL(new RegExp(`/projects/`));
    await expect(page.getByRole("heading", { name: projectName })).toBeVisible();
    await expect(page.getByText("Project created.")).toBeVisible();

    await breadcrumb(page).getByRole("link", { name: "Projects" }).click();
    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page.getByRole("heading", { name: projectName })).toBeVisible();

    await openFromList(page, projectName);
    await expect(page.getByRole("heading", { name: projectName })).toBeVisible();

    // Add website review.
    await page.getByRole("button", { name: "Add review" }).first().click();
    const addReview = page.getByRole("dialog", { name: "Add review" });
    await addReview.getByLabel("Review name").fill(websiteReview);
    await addReview.getByLabel("Website address").fill("https://example.com/start");
    await addReview.getByRole("button", { name: "Add review" }).click();

    await expect(page.getByRole("heading", { name: websiteReview })).toBeVisible();
    await expect(page.getByText("Draft")).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Website setup" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Website setup", exact: true }).click();
    const websiteSetup = page.getByRole("dialog", { name: "Website setup" });
    await expect(websiteSetup).toBeVisible();
    await expect(
      websiteSetup.getByRole("button", { name: "Copy install code" }),
    ).toBeVisible();
    await websiteSetup.getByRole("button", { name: "Close" }).click();
    await expect(websiteSetup).toHaveCount(0);
    await page.getByRole("button", { name: "Learn about website setup" }).click();
    await expect(
      page.getByRole("dialog", { name: "Installing Passoff on a website" }),
    ).toBeVisible();
    await page.keyboard.press("Escape");

    await breadcrumb(page).getByRole("link", { name: projectName }).click();

    // Rename project.
    await chooseFromActions(page, `Actions for ${projectName}`, "Rename project");
    const renameProject = page.getByRole("dialog", { name: "Rename project" });
    await renameProject.getByLabel("Project name").fill(renamedProject);
    await renameProject.getByRole("button", { name: "Save project name" }).click();
    await expect(
      page.getByRole("heading", { name: renamedProject }),
    ).toBeVisible();
    // Let the dialog finish closing (it hands focus back) before opening the next menu.
    await expect(renameProject).toBeHidden();

    // Rename website review.
    await openFromList(page, websiteReview);
    await expect(
      page.getByRole("heading", { name: websiteReview }),
    ).toBeVisible();
    await chooseFromActions(page, `Actions for ${websiteReview}`, "Rename review");
    const renameReviewDialog = page.getByRole("dialog", {
      name: "Rename review",
    });
    await renameReviewDialog.getByLabel("Review name").fill(renamedReview);
    await renameReviewDialog
      .getByRole("button", { name: "Save review name" })
      .click();
    await expect(
      page.getByRole("heading", { name: renamedReview }),
    ).toBeVisible();

    await breadcrumb(page).getByRole("link", { name: renamedProject }).click();
    await expect(page).toHaveURL(/\/projects\/[^/]+$/);
    await expect(
      page.getByRole("heading", { name: renamedProject }),
    ).toBeVisible();

    // Archive a review.
    await chooseFromActions(page, `Actions for ${renamedReview}`, "Archive review");
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Archive review" })
      .click();
    await expect(page.getByText("Review archived.")).toBeVisible();

    // Archive project.
    await chooseFromActions(page, `Actions for ${renamedProject}`, "Archive project");
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Archive project" })
      .click();
    await expect(page).toHaveURL(/status=archived/);
    await expect(page.getByText("Project archived.")).toBeVisible();
    await expect(
      page.getByRole("heading", { name: renamedProject }),
    ).toBeVisible();

    // Search for the project.
    await page.getByLabel("Search projects").fill("Acme");
    await expect(page).toHaveURL(/q=Acme/);
    await expect(
      page.getByRole("heading", { name: renamedProject }),
    ).toBeVisible();

    // Restore project.
    await openFromList(page, renamedProject);
    await chooseFromActions(page, `Actions for ${renamedProject}`, "Restore project");
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Restore project" })
      .click();
    await expect(page.getByText("Project restored.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Add review" }).first()).toBeVisible();

    // Member cannot delete.
    const memberResponse = await request.post("/api/test/add-team-member", {
      data: {
        ownerEmail,
        email: memberEmail,
        password,
        firstName: "E2E",
        lastName: "Member",
      },
    });
    expect(memberResponse.ok()).toBeTruthy();

    await signOut(page);
    await page.getByLabel("Email").fill(memberEmail);
    await page.locator("#password").fill(password);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/\/dashboard/);
    await openFromList(page, renamedProject);
    await page
      .getByRole("button", { name: `Actions for ${renamedProject}` })
      .click();
    await expect(
      page.getByRole("menuitem", { name: "Delete project" }),
    ).toHaveCount(0);
    await page.keyboard.press("Escape");

    // Owner can soft-delete.
    await signOut(page);
    await page.getByLabel("Email").fill(ownerEmail);
    await page.locator("#password").fill(password);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/\/dashboard/);
    await openFromList(page, renamedProject);
    // The menu only opens once the page has hydrated, so retry the click.
    await expect(async () => {
      const item = page.getByRole("menuitem", { name: "Delete project" });
      if (!(await item.isVisible())) {
        await page.getByRole("button", { name: `Actions for ${renamedProject}` }).click();
      }
      await expect(item).toBeVisible({ timeout: 1_000 });
    }).toPass({ timeout: 15_000 });
    await page.getByRole("menuitem", { name: "Delete project" }).click();
    const deleteDialog = page.getByRole("dialog", {
      name: `Delete ${renamedProject}?`,
    });
    await deleteDialog
      .getByLabel("Type the project name to confirm")
      .fill(renamedProject);
    await deleteDialog.getByRole("button", { name: "Delete project" }).click();
    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page.getByText("Project deleted.")).toBeVisible();
    await expect(page.getByText("No projects yet")).toBeVisible();

    // Keyboard and accessibility check on dashboard.
    await page.keyboard.press("Tab");
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual(
      [],
    );
  });

  test("protected project routes redirect unauthenticated visitors", async ({
    page,
  }) => {
    await page.goto("/projects/00000000-0000-4000-8000-000000000000");
    await expect(page).toHaveURL(/\/sign-in/);
  });
});
