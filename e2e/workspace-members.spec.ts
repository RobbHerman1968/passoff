import AxeBuilder from "@axe-core/playwright";
import { expect, test, type APIRequestContext, type Browser, type Page } from "@playwright/test";

const PASSWORD = "workspace-passphrase-42";
const uniqueEmail = (label: string) =>
  `e2e.${label}.${Date.now()}.${Math.random().toString(16).slice(2)}@example.com`;

async function createAccount(page: Page, email: string, lastName: string) {
  await page.getByLabel("First name").fill("E2E");
  await page.getByLabel("Last name").fill(lastName);
  await page.getByLabel("Email").fill(email);
  await page.locator("#password").fill(PASSWORD);
  await page.locator("#confirmPassword").fill(PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();
}

async function signUpAndOnboard(page: Page, email: string, workspaceName: string, lastName = "Owner") {
  await page.goto("/sign-up");
  await createAccount(page, email, lastName);
  await expect(page).toHaveURL(/\/onboarding/);
  await page.getByLabel("Workspace name").fill(workspaceName);
  await page.getByRole("button", { name: "Create your workspace" }).click();
  await expect(page).toHaveURL(/\/dashboard/);
}

async function givePlan(request: APIRequestContext, ownerEmail: string) {
  const response = await request.post("/api/test/seed-subscription", {
    data: { ownerEmail, plan: "agency" },
  });
  expect(response.ok(), `seed-subscription ${response.status()} ${await response.text()}`).toBeTruthy();
}

async function sendInvitation(page: Page, email: string) {
  await page.goto("/settings/members");
  await page.getByLabel("Email address").fill(email);
  await page.getByRole("button", { name: "Send invitation" }).click();
  await expect(page.getByRole("status").filter({ hasText: /invitation/i }).first()).toBeVisible();
  await expect(page.getByRole("list", { name: "Open invitations" }).getByText(email)).toBeVisible();
}

async function invitationPath(request: APIRequestContext, email: string) {
  let path: string | null = null;
  await expect(async () => {
    const response = await request.get(`/api/test/last-invitation-link?email=${encodeURIComponent(email)}`);
    path = ((await response.json()) as { path: string | null }).path;
    expect(path).toBeTruthy();
  }).toPass({ timeout: 15_000 });
  return path as unknown as string;
}

async function newPage(browser: Browser) {
  const context = await browser.newContext();
  return { context, page: await context.newPage() };
}

async function expectNoHorizontalScroll(page: Page, label: string) {
  const { overflow, offenders } = await page.evaluate(() => {
    const viewport = document.documentElement.clientWidth;
    const wide = Array.from(document.body.querySelectorAll("*"))
      .filter((element) => element.getBoundingClientRect().right > viewport + 1)
      .slice(0, 5)
      .map((element) => `${element.tagName.toLowerCase()}.${String(element.getAttribute("class") ?? "").slice(0, 60)}`);
    return { overflow: document.documentElement.scrollWidth - viewport, offenders: wide };
  });
  expect(overflow, `${label}: ${offenders.join(" | ")}`).toBeLessThanOrEqual(1);
}

test.describe("workspace members, invitations, and account", () => {
  test("owner invites a new person, who creates an account and joins", async ({ page, request, browser }) => {
    test.setTimeout(180_000);
    const ownerEmail = uniqueEmail("owner");
    const guestEmail = uniqueEmail("newbie");
    await signUpAndOnboard(page, ownerEmail, "Invite Flow Studio");
    await givePlan(request, ownerEmail);

    await page.goto("/settings/members");
    await expect(page).toHaveTitle(/Members/);
    await expect(page.getByRole("heading", { level: 1, name: "Members" })).toBeVisible();
    await expect(page.getByText("No open invitations")).toBeVisible();

    await sendInvitation(page, guestEmail);
    await expect(page.getByText("Waiting to join")).toBeVisible();

    const path = await invitationPath(request, guestEmail);
    const { context, page: guest } = await newPage(browser);

    // Signed out: the page explains the invitation and offers both ways in.
    await guest.goto(path);
    await expect(guest.getByText(/invited you to join/)).toBeVisible();
    await expect(guest.getByText(/Invite Flow Studio/)).toBeVisible();
    await guest.getByRole("link", { name: "Create account to join" }).click();
    await expect(guest).toHaveURL(/\/sign-up\?callbackUrl=/);
    await createAccount(guest, guestEmail, "Newbie");
    await expect(guest).toHaveURL(new RegExp(path));

    await guest.getByRole("button", { name: "Join Invite Flow Studio" }).click();
    await expect(guest).toHaveURL(/\/dashboard/);
    await expect(guest.getByText("You joined the workspace.")).toBeVisible();

    // The same link cannot be used twice by someone else.
    await guest.goto(path);
    await expect(guest.getByText("This invitation was already used")).toBeVisible();

    // The owner sees the new member and no open invitations.
    await page.goto("/settings/members");
    await expect(page.getByText("E2E Newbie")).toBeVisible();
    await expect(page.getByText("No open invitations")).toBeVisible();

    // A member sees the list but no owner controls.
    await guest.goto("/settings/members");
    await expect(guest.getByText(/Only the workspace owner can invite/)).toBeVisible();
    await expect(guest.getByRole("button", { name: /Actions for/ })).toHaveCount(0);

    await context.close();
  });

  test("an existing person joins a second workspace, switches between them, and leaves", async ({
    page,
    request,
    browser,
  }) => {
    test.setTimeout(180_000);
    const ownerEmail = uniqueEmail("owner2");
    const existingEmail = uniqueEmail("existing");
    await signUpAndOnboard(page, ownerEmail, "Host Studio");
    await givePlan(request, ownerEmail);

    const { context, page: existing } = await newPage(browser);
    await signUpAndOnboard(existing, existingEmail, "Own Studio", "Existing");

    await sendInvitation(page, existingEmail);
    const path = await invitationPath(request, existingEmail);

    await existing.goto(path);
    await existing.getByRole("button", { name: "Join Host Studio" }).click();
    await expect(existing).toHaveURL(/\/dashboard/);

    // Now in two workspaces: the switcher appears and the choice sticks across loads.
    const switcher = existing.getByRole("button", { name: /Workspace: Host Studio\. Switch workspace/ }).first();
    await expect(async () => {
      await expect(switcher).toBeVisible();
    }).toPass({ timeout: 10_000 });
    await switcher.click();
    await existing.getByRole("menuitemradio", { name: /Own Studio/ }).click();
    await expect(existing.getByText("Workspace switched.")).toBeVisible();
    await existing.reload();
    await expect(
      existing.getByRole("button", { name: /Workspace: Own Studio\. Switch workspace/ }).first(),
    ).toBeVisible();

    // Back in Host Studio, leave from account settings.
    await existing.getByRole("button", { name: /Workspace: Own Studio\. Switch workspace/ }).first().click();
    await existing.getByRole("menuitemradio", { name: /Host Studio/ }).click();
    await expect(
      existing.getByRole("button", { name: /Workspace: Host Studio\. Switch workspace/ }).first(),
    ).toBeVisible();
    await existing.goto("/settings/account");
    await existing.getByRole("button", { name: "Leave workspace…" }).click();
    await existing.getByRole("alertdialog").getByRole("button", { name: "Leave workspace" }).click();
    await expect(existing).toHaveURL(/\/dashboard/);
    await expect(existing.getByText("You left the workspace.")).toBeVisible();

    await page.goto("/settings/members");
    await expect(page.getByText("E2E Existing")).toHaveCount(0);

    await context.close();
  });

  test("someone signed in with the wrong email is told, without exposing the invited address", async ({
    page,
    request,
    browser,
  }) => {
    test.setTimeout(180_000);
    const ownerEmail = uniqueEmail("owner3");
    const invitedEmail = uniqueEmail("invited");
    await signUpAndOnboard(page, ownerEmail, "Mismatch Studio");
    await givePlan(request, ownerEmail);
    await sendInvitation(page, invitedEmail);
    const path = await invitationPath(request, invitedEmail);

    const { context, page: other } = await newPage(browser);
    await signUpAndOnboard(other, uniqueEmail("other"), "Other Studio", "Other");
    await other.goto(path);
    await expect(other.getByText("This invitation is for a different email address")).toBeVisible();
    await expect(other.getByText(invitedEmail)).toHaveCount(0);
    await expect(other.getByRole("button", { name: /^Join/ })).toHaveCount(0);
    const results = await new AxeBuilder({ page: other }).analyze();
    expect(results.violations).toEqual([]);

    // Cancelling the invitation kills the link.
    await page.goto("/settings/members");
    await page.getByRole("button", { name: `Cancel invitation for ${invitedEmail}` }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Cancel invitation" }).click();
    await expect(page.getByText("No open invitations")).toBeVisible();
    await other.goto(path);
    await expect(other.getByText("This invitation was cancelled")).toBeVisible();

    await context.close();
  });

  test("owner removes a member and hands over ownership", async ({ page, request, browser }) => {
    test.setTimeout(180_000);
    const ownerEmail = uniqueEmail("owner4");
    const memberEmail = uniqueEmail("member");
    const secondEmail = uniqueEmail("second");
    await signUpAndOnboard(page, ownerEmail, "Roles Studio");
    await givePlan(request, ownerEmail);

    for (const [email, lastName] of [
      [memberEmail, "Removable"],
      [secondEmail, "Heir"],
    ] as const) {
      const added = await request.post("/api/test/add-team-member", {
        data: { ownerEmail, email, password: PASSWORD, firstName: "E2E", lastName },
      });
      expect(added.ok()).toBeTruthy();
    }

    await page.goto("/settings/members");
    await expect(page.getByText("E2E Removable")).toBeVisible();

    // Remove: names the person, explains the consequences, then confirms.
    await page.getByRole("button", { name: "Actions for E2E Removable" }).click();
    await page.getByRole("menuitem", { name: "Remove from workspace" }).click();
    const removeDialog = page.getByRole("alertdialog");
    await expect(removeDialog.getByText("Remove E2E Removable?")).toBeVisible();
    await expect(removeDialog.getByText(/comments and history stay/i)).toBeVisible();
    await removeDialog.getByRole("button", { name: "Remove from workspace" }).click();
    await expect(page.getByRole("listitem").filter({ hasText: "E2E Removable" })).toHaveCount(0);

    // The removed person can still sign in but has no workspace.
    const { context, page: removed } = await newPage(browser);
    await removed.goto("/sign-in");
    await removed.getByLabel("Email").fill(memberEmail);
    await removed.locator("#password").fill(PASSWORD);
    await removed.getByRole("button", { name: "Sign in" }).click();
    await expect(removed).toHaveURL(/\/onboarding/);
    await context.close();

    // Hand over ownership.
    await page.getByRole("button", { name: "Actions for E2E Heir" }).click();
    await page.getByRole("menuitem", { name: "Make owner" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Make owner" }).click();
    await expect(page.getByText(/is now the workspace owner/)).toBeVisible();
    await page.reload();
    await expect(page.getByRole("button", { name: /Actions for/ })).toHaveCount(0);
    await page.goto("/settings/workspace");
    await expect(page.getByRole("button", { name: "Delete workspace…" })).toHaveCount(0);
  });

  test("owner deletes the workspace by typing its name", async ({ page, request, browser }) => {
    test.setTimeout(180_000);
    const ownerEmail = uniqueEmail("owner5");
    const guestEmail = uniqueEmail("pending");
    await signUpAndOnboard(page, ownerEmail, "Doomed Studio");
    await givePlan(request, ownerEmail);
    await sendInvitation(page, guestEmail);
    const path = await invitationPath(request, guestEmail);

    await page.goto("/settings/workspace");
    await page.getByRole("button", { name: "Delete workspace…" }).click();
    const dialog = page.getByRole("dialog");
    const confirm = dialog.getByRole("button", { name: "Delete workspace" });
    await expect(confirm).toBeDisabled();
    await dialog.getByLabel(/Type “Doomed Studio” to confirm/).fill("Doomed Studio");
    await confirm.click();
    await expect(page).toHaveURL(/\/onboarding/);

    const { context, page: guest } = await newPage(browser);
    await guest.goto(path);
    await expect(guest.getByText("This invitation link isn’t valid")).toBeVisible();
    await context.close();
  });

  test("a person can rename themselves and delete their account", async ({ page }) => {
    test.setTimeout(120_000);
    const email = uniqueEmail("leaver");
    await signUpAndOnboard(page, email, "Account Studio");

    await page.goto("/settings/account");
    await expect(page).toHaveTitle(/account/i);
    await page.getByLabel("First name").fill("Renamed");
    await page.getByRole("button", { name: "Save name" }).click();
    await expect(page.getByText(/saved|updated/i).first()).toBeVisible();

    await page.getByRole("button", { name: "Delete my account…" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.locator("#delete-account-password").fill("wrong-password-123");
    await dialog.getByRole("button", { name: "Delete my account" }).click();
    await expect(dialog.getByText(/password isn’t right/i).first()).toBeVisible();

    await dialog.locator("#delete-account-password").fill(PASSWORD);
    await dialog.getByRole("button", { name: "Delete my account" }).click();
    await expect(page).toHaveURL(/\/sign-in/);
    await expect(page.getByText(/Your account was deleted/)).toBeVisible();

    // The old credentials no longer work.
    await page.getByLabel("Email").fill(email);
    await page.locator("#password").fill(PASSWORD);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/\/sign-in/);
  });

  test("settings pages are accessible and fit every screen width", async ({ page, request }) => {
    test.setTimeout(180_000);
    const ownerEmail = uniqueEmail("a11y");
    await signUpAndOnboard(page, ownerEmail, "Responsive Studio");
    await givePlan(request, ownerEmail);
    await request.post("/api/test/add-team-member", {
      data: {
        ownerEmail,
        email: uniqueEmail("pal"),
        password: PASSWORD,
        firstName: "A Very Long Given Name",
        lastName: "With An Equally Long Family Name",
      },
    });
    await sendInvitation(page, uniqueEmail("a-really-long-address-for-testing-overflow"));

    for (const route of ["/settings/workspace", "/settings/members", "/settings/account"]) {
      for (const width of [320, 375, 768, 1024, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        await page.goto(route);
        await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
        await expectNoHorizontalScroll(page, `${route} at ${width}px`);
      }
      await page.setViewportSize({ width: 1024, height: 900 });
      await page.goto(route);
      await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
      const results = await new AxeBuilder({ page }).analyze();
      expect(results.violations, route).toEqual([]);
    }
  });
});
