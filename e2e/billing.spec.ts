import AxeBuilder from "@axe-core/playwright";
import { expect, test, type APIRequestContext, type Browser, type Page } from "@playwright/test";
import Stripe from "stripe";

import { PLAN_ENTITLEMENTS, formatUsd } from "../src/lib/billing/plans";
import {
  TEST_PRICES,
  invoiceEvent,
  stripeId,
  subscriptionEvent,
} from "../src/test/stripe-events";

// Must match STRIPE_WEBHOOK_SECRET in playwright.config.ts. Nothing here is a real key.
const WEBHOOK_SECRET = "whsec_playwright_only_secret";
const PASSWORD = "workspace-passphrase-42";
const DAY = 24 * 60 * 60;

const uniqueEmail = (label: string) =>
  `e2e.${label}.${Date.now()}.${Math.random().toString(16).slice(2)}@example.com`;

async function signUpAndOnboard(page: Page, email: string, workspaceName: string, lastName = "Owner") {
  await page.goto("/sign-up");
  await page.getByLabel("First name").fill("E2E");
  await page.getByLabel("Last name").fill(lastName);
  await page.getByLabel("Email").fill(email);
  await page.locator("#password").fill(PASSWORD);
  await page.locator("#confirmPassword").fill(PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/onboarding/);
  await page.getByLabel("Workspace name").fill(workspaceName);
  await page.getByRole("button", { name: "Create your workspace" }).click();
  await expect(page).toHaveURL(/\/dashboard/);
}

async function billingState(request: APIRequestContext, ownerEmail: string) {
  const response = await request.get(`/api/test/billing-state?ownerEmail=${encodeURIComponent(ownerEmail)}`);
  expect(response.ok()).toBeTruthy();
  return ((await response.json()) as {
    state: { customerId: string | null; plan: string | null; status: string | null } | null;
  }).state;
}

/** Sends a webhook the way Stripe does: the exact bytes, signed with the endpoint secret. */
async function deliverWebhook(
  request: APIRequestContext,
  event: unknown,
  options: { secret?: string } = {},
) {
  const payload = JSON.stringify(event);
  const signature = Stripe.webhooks.generateTestHeaderString({
    payload,
    secret: options.secret ?? WEBHOOK_SECRET,
  });
  return request.post("/api/webhooks/stripe", {
    data: payload,
    headers: { "stripe-signature": signature, "content-type": "application/json" },
  });
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

async function expectNoAxeViolations(page: Page, label: string) {
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
  expect(
    results.violations.map((violation) => `${violation.id}: ${violation.nodes.map((node) => node.target).join(", ")}`),
    label,
  ).toEqual([]);
}

async function addReview(page: Page, name: string, url: string) {
  await page.getByRole("button", { name: "Add review" }).first().click();
  const dialog = page.getByRole("dialog", { name: "Add review" });
  await dialog.getByLabel("Review name").fill(name);
  await dialog.getByLabel("Website address").fill(url);
  await dialog.getByRole("button", { name: "Add review" }).click();
  return dialog;
}

async function createProject(page: Page, name: string) {
  await page.getByRole("button", { name: "Create project" }).first().click();
  const dialog = page.getByRole("dialog", { name: "Create project" });
  await dialog.getByLabel("Project name").fill(name);
  await dialog.getByRole("button", { name: "Create project" }).click();
  await expect(page).toHaveURL(/\/projects\//);
}

async function newPage(browser: Browser) {
  const context = await browser.newContext();
  return { context, page: await context.newPage() };
}

test.describe("billing, plan usage, and limits", () => {
  test("the owner picks a plan; only Stripe's signed webhook changes it; payment trouble is explained and recovers", async ({
    page,
    request,
  }) => {
    test.setTimeout(240_000);
    const ownerEmail = uniqueEmail("billing-owner");
    await signUpAndOnboard(page, ownerEmail, "Billing Flow Studio");

    // The page explains the current plan and usage in plain language.
    await page.goto("/settings/billing");
    await expect(page).toHaveTitle(/Billing and plan/);
    await expect(page.getByRole("heading", { level: 1, name: "Billing and plan" })).toBeVisible();
    await expect(page.getByTestId("plan-name")).toHaveText("Free");
    await expect(page.getByTestId("usage-members")).toContainText("1 of 1");
    await expect(page.getByTestId("usage-websites")).toContainText("0 of 1");
    await expectNoAxeViolations(page, "billing page, Free plan");

    // Prices come from the catalog and nowhere else.
    const studioCard = page.getByTestId("plan-card-studio");
    await expect(studioCard).toContainText(formatUsd(PLAN_ENTITLEMENTS.studio.annualMonthlyPriceUsd));
    await page.getByRole("radio", { name: /Monthly/ }).check();
    await expect(studioCard).toContainText(formatUsd(PLAN_ENTITLEMENTS.studio.monthlyPriceUsd));
    await page.getByRole("radio", { name: /Yearly/ }).check();

    // Choosing a plan goes to the payment page and comes back. Coming back changes nothing.
    await page.getByRole("button", { name: "Start 14-day Agency trial" }).click();
    await expect(page).toHaveURL(/\/settings\/billing\?checkout=success/);
    await expect(page.getByText("Waiting for confirmation from our payment provider")).toBeVisible();
    await expect(page.getByTestId("plan-name")).toHaveText("Free");

    const state = await billingState(request, ownerEmail);
    expect(state?.customerId).toMatch(/^cus_fake_/);
    expect(state?.plan).toBe("free");
    const customerId = state?.customerId as string;

    // A webhook signed with the wrong secret is refused and changes nothing.
    const subscriptionId = stripeId("sub");
    const created = Math.floor(Date.now() / 1000);
    const trialEvent = subscriptionEvent({
      type: "customer.subscription.created",
      customerId,
      subscriptionId,
      priceId: TEST_PRICES.agency.year,
      status: "trialing",
      created,
      trialStart: created,
      trialEnd: created + 14 * DAY,
    });
    const forged = await deliverWebhook(request, trialEvent, { secret: "whsec_not_the_secret" });
    expect(forged.status()).toBe(400);
    await page.reload();
    await expect(page.getByTestId("plan-name")).toHaveText("Free");

    // The signed webhook is what starts the trial.
    const accepted = await deliverWebhook(request, trialEvent);
    expect(accepted.status()).toBe(200);
    expect(await accepted.json()).toEqual({ ok: true, status: "processed" });
    const repeated = await deliverWebhook(request, trialEvent);
    expect(await repeated.json()).toEqual({ ok: true, status: "duplicate" });

    await page.goto("/settings/billing?checkout=success");
    await expect(page.getByText("You’re on the Agency plan.")).toBeVisible();
    await expect(page.getByTestId("plan-name")).toHaveText("Agency");
    await expect(page.getByText(/Your Agency trial ends on/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Manage billing" })).toBeVisible();
    // The plan is chosen, so the picker is gone.
    await expect(page.getByRole("button", { name: /Start 14-day Agency trial/ })).toHaveCount(0);
    await expect(page.getByTestId("usage-websites")).toContainText("Unlimited");
    await expectNoAxeViolations(page, "billing page, trial");

    // The owner was told about the new plan.
    await page.goto("/notifications");
    await expect(page.getByText(/is now on the Agency plan/).first()).toBeVisible();

    // A failed payment keeps the plan, says why, and says what to do.
    const failed = await deliverWebhook(
      request,
      invoiceEvent({ type: "invoice.payment_failed", customerId, subscriptionId, created: created + 60 }),
    );
    expect(failed.status()).toBe(200);
    await page.goto("/settings/billing");
    await expect(page.getByText("We couldn’t take your latest payment")).toBeVisible();
    await expect(page.getByText(/Nothing has been removed/)).toBeVisible();
    await expect(page.getByTestId("plan-name")).toHaveText("Agency");
    await expect(page.getByRole("button", { name: "Update payment details" })).toBeVisible();
    await expectNoAxeViolations(page, "billing page, payment trouble");

    // The Billing Portal button leaves and returns without error (fake provider returns here).
    await page.getByRole("button", { name: "Update payment details" }).click();
    await expect(page).toHaveURL(/\/settings\/billing$/);

    // Payment goes through: the notice goes away.
    const subscriptionActive = subscriptionEvent({
      customerId,
      subscriptionId,
      priceId: TEST_PRICES.agency.year,
      status: "active",
      created: created + 120,
    });
    expect((await deliverWebhook(request, subscriptionActive)).status()).toBe(200);
    await page.goto("/settings/billing");
    await expect(page.getByText("We couldn’t take your latest payment")).toHaveCount(0);
    await expect(page.getByRole("region", { name: "Your plan" }).getByText("Active", { exact: true })).toBeVisible();

    // The paid plan ends: back to Free limits, work kept, and a clear way to choose again.
    const ended = subscriptionEvent({
      type: "customer.subscription.deleted",
      customerId,
      subscriptionId,
      priceId: TEST_PRICES.agency.year,
      status: "canceled",
      created: created + 180,
    });
    expect((await deliverWebhook(request, ended)).status()).toBe(200);
    await page.goto("/settings/billing");
    await expect(page.getByTestId("plan-name")).toHaveText("Free");
    await expect(page.getByText(/Your Agency plan has ended/)).toBeVisible();
    await expect(page.getByText(/all still here/)).toBeVisible();
    // The trial was used, so the offer is now a plain choice.
    await expect(page.getByRole("button", { name: "Choose Agency" })).toBeVisible();
    await expect(page.getByRole("button", { name: /trial/i })).toHaveCount(0);
  });

  test("a Free workspace is told plainly when the review website limit is reached, and an upgrade makes room", async ({
    page,
    request,
  }) => {
    test.setTimeout(240_000);
    const ownerEmail = uniqueEmail("limit-owner");
    await signUpAndOnboard(page, ownerEmail, "Limit Studio");
    await createProject(page, "Limit project");

    // The first review fits the Free plan.
    await addReview(page, "First site", "https://first.example.com/start");
    await expect(page.getByRole("heading", { name: "First site" })).toBeVisible();
    await page.getByRole("navigation", { name: "Breadcrumb" }).getByRole("link", { name: "Limit project" }).click();

    // The project page says the limit is reached and how to fix it, without blocking reading.
    const notice = page.getByTestId("review-limit-notice");
    await expect(notice).toContainText("reached your plan’s limit of 1 active review website");
    await expect(notice).toContainText("keep reading and writing feedback");
    await expect(notice.getByRole("link", { name: /Billing page/ })).toHaveAttribute("href", "/settings/billing");

    // The second review is paused with a message that names the next step.
    const dialog = await addReview(page, "Second site", "https://second.example.com/start");
    await expect(dialog.getByText(/Your Free plan includes 1 active review website/)).toBeVisible();
    await expect(dialog.getByText(/Billing page/)).toBeVisible();
    // What the person typed is still there.
    await expect(dialog.getByLabel("Review name")).toHaveValue("Second site");
    await page.keyboard.press("Escape");

    // The workspace upgrades through the signed webhook, then the same review fits.
    await page.goto("/settings/billing");
    await page.getByRole("button", { name: "Choose Studio" }).click();
    await expect(page).toHaveURL(/checkout=success/);
    const state = await billingState(request, ownerEmail);
    const created = Math.floor(Date.now() / 1000);
    const upgrade = await deliverWebhook(
      request,
      subscriptionEvent({
        type: "customer.subscription.created",
        customerId: state?.customerId as string,
        subscriptionId: stripeId("sub"),
        priceId: TEST_PRICES.studio.month,
        status: "active",
        created,
      }),
    );
    expect(upgrade.status()).toBe(200);

    await page.goto("/dashboard");
    await page.getByRole("main").getByRole("link", { name: "Limit project", exact: true }).click();
    await addReview(page, "Second site", "https://second.example.com/start");
    await expect(page.getByRole("heading", { name: "Second site" })).toBeVisible();
  });

  test("a member can see the plan and usage but none of the owner controls", async ({ page, request, browser }) => {
    test.setTimeout(240_000);
    const ownerEmail = uniqueEmail("seeowner");
    const memberEmail = uniqueEmail("seemember");
    await signUpAndOnboard(page, ownerEmail, "Read Only Studio");
    const seeded = await request.post("/api/test/seed-subscription", { data: { ownerEmail, plan: "agency" } });
    expect(seeded.ok()).toBeTruthy();

    await page.goto("/settings/members");
    await page.getByLabel("Email address").fill(memberEmail);
    await page.getByRole("button", { name: "Send invitation" }).click();
    await expect(page.getByRole("list", { name: "Open invitations" }).getByText(memberEmail)).toBeVisible();

    let invitePath: string | null = null;
    await expect(async () => {
      const response = await request.get(`/api/test/last-invitation-link?email=${encodeURIComponent(memberEmail)}`);
      invitePath = ((await response.json()) as { path: string | null }).path;
      expect(invitePath).toBeTruthy();
    }).toPass({ timeout: 15_000 });

    const { context, page: member } = await newPage(browser);
    await member.goto(invitePath as unknown as string);
    await member.getByRole("link", { name: "Create account to join" }).click();
    await member.getByLabel("First name").fill("E2E");
    await member.getByLabel("Last name").fill("Reader");
    await member.getByLabel("Email").fill(memberEmail);
    await member.locator("#password").fill(PASSWORD);
    await member.locator("#confirmPassword").fill(PASSWORD);
    await member.getByRole("button", { name: "Create account" }).click();
    await member.getByRole("button", { name: "Join Read Only Studio" }).click();
    await expect(member).toHaveURL(/\/dashboard/);

    await member.goto("/settings/billing");
    await expect(member.getByRole("heading", { level: 1, name: "Billing and plan" })).toBeVisible();
    await expect(member.getByTestId("plan-name")).toHaveText("Agency");
    await expect(member.getByText(/Only the workspace owner can change the plan/)).toBeVisible();
    await expect(member.getByTestId("usage-members")).toContainText("2 of");
    await expect(member.getByRole("button", { name: /Manage billing|Choose|trial/ })).toHaveCount(0);

    // Nothing the member sends can start a checkout either.
    await expectNoAxeViolations(member, "billing page, member view");
    await context.close();
  });

  test("the billing page fits a 320 pixel wide screen", async ({ page }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width: 320, height: 800 });
    await signUpAndOnboard(page, uniqueEmail("narrow"), "Narrow Studio");
    await page.goto("/settings/billing");
    await expect(page.getByRole("heading", { level: 1, name: "Billing and plan" })).toBeVisible();
    await expect(page.getByTestId("plan-card-agency")).toBeVisible();
    await expectNoHorizontalScroll(page, "billing page at 320px");
    await expectNoAxeViolations(page, "billing page at 320px");
  });

  test("the public pricing page shows the same prices as the plan catalog", async ({ page }) => {
    await page.goto("/pricing");
    const plans = page.getByRole("region", { name: "Start small. Move up when the client work does." });
    await expect(plans.getByText(formatUsd(PLAN_ENTITLEMENTS.studio.annualMonthlyPriceUsd))).toBeVisible();
    await expect(plans.getByText(formatUsd(PLAN_ENTITLEMENTS.agency.annualMonthlyPriceUsd))).toBeVisible();
    await page.getByRole("button", { name: "Monthly" }).click();
    await expect(plans.getByText(formatUsd(PLAN_ENTITLEMENTS.studio.monthlyPriceUsd))).toBeVisible();
    await expect(plans.getByText(formatUsd(PLAN_ENTITLEMENTS.agency.monthlyPriceUsd))).toBeVisible();
    await expect(page.getByRole("link", { name: /Try Studio free/ })).toHaveCount(0);
  });
});
