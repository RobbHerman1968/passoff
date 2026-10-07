import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Browser, type Page } from "@playwright/test";

/**
 * Launch hardening (Story 8): public pages, error pages, security headers, guest link
 * revocation, and workspace isolation. Covers workflows that no other spec owns.
 */

const uniqueEmail = (tag: string) =>
  `e2e.${tag}.${Date.now()}.${Math.random().toString(16).slice(2)}@example.com`;

const VIEWPORTS = [320, 375, 768, 1024, 1440] as const;
const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

async function signUpAndOnboard(
  page: Page,
  options: { email: string; password: string; workspaceName: string },
) {
  await page.goto("/sign-up");
  await page.getByLabel("First name").fill("E2E");
  await page.getByLabel("Last name").fill("Hardening");
  await page.getByLabel("Email").fill(options.email);
  await page.locator("#password").fill(options.password);
  await page.locator("#confirmPassword").fill(options.password);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/onboarding/);
  await page.getByLabel("Workspace name").fill(options.workspaceName);
  await page.getByRole("button", { name: "Create your workspace" }).click();
  await expect(page).toHaveURL(/\/dashboard/);
}

async function hasHorizontalScroll(page: Page) {
  return page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
  );
}

async function wideElements(page: Page) {
  return page.evaluate(() => {
    const limit = document.documentElement.clientWidth;
    return [...document.querySelectorAll<HTMLElement>("body *")]
      .filter((element) => element.getBoundingClientRect().right > limit + 1)
      .slice(0, 6)
      .map((element) => `${element.tagName.toLowerCase()}.${String(element.className).slice(0, 80)}`);
  });
}

async function newSignedInUser(browser: Browser, tag: string) {
  const context = await browser.newContext();
  const page = await context.newPage();
  const email = uniqueEmail(tag);
  await signUpAndOnboard(page, {
    email,
    password: "hardening-passphrase-42",
    workspaceName: `Hardening ${tag}`,
  });
  return { context, page, email };
}

test.describe("public pages", () => {
  test("every page in the sitemap has one h1, a unique title, and no sideways scroll on a phone", async ({
    page,
    request,
  }) => {
    test.setTimeout(240_000);
    const sitemap = await (await request.get("/sitemap.xml")).text();
    const paths = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => {
      const url = new URL(match[1]);
      return url.pathname;
    });
    expect(paths.length).toBeGreaterThan(5);

    await page.setViewportSize({ width: 320, height: 800 });
    const titles = new Map<string, string>();
    for (const path of [...paths, "/sign-in", "/sign-up", "/forgot-password"]) {
      const response = await page.goto(path);
      expect(response?.status(), path).toBe(200);
      await expect(page.locator("h1"), path).toHaveCount(1);
      const title = await page.title();
      expect(title.length, `${path} needs a title`).toBeGreaterThan(3);
      expect(titles.get(title), `${path} repeats the title of ${titles.get(title)}`).toBeUndefined();
      titles.set(title, path);
      expect(await hasHorizontalScroll(page), `${path} scrolls sideways at 320px`).toBe(false);
    }
  });

  for (const path of ["/", "/pricing", "/alternatives", "/sign-in", "/sign-up"]) {
    test(`${path} passes automated WCAG 2.2 AA checks at every required width`, async ({ page }) => {
      test.setTimeout(120_000);
      for (const width of VIEWPORTS) {
        await page.setViewportSize({ width, height: 900 });
        await page.goto(path);
        await expect(page.locator("h1")).toHaveCount(1);
        expect(await hasHorizontalScroll(page), `${path} scrolls sideways at ${width}px`).toBe(false);
        const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
        expect(
          results.violations.map((violation) => `${violation.id}: ${violation.help}`),
          `${path} at ${width}px`,
        ).toEqual([]);
      }
    });
  }

  test("the sign-in form works from the keyboard alone and keeps focus visible", async ({ page }) => {
    await page.goto("/sign-in");
    await page.waitForLoadState("networkidle");
    await page.keyboard.press("Tab");
    const focusedNames: string[] = [];
    for (let step = 0; step < 12; step += 1) {
      const info = await page.evaluate(() => {
        const element = document.activeElement as HTMLElement | null;
        // Next.js's development-only issue badge is not part of the product.
        if (!element || element === document.body || element.tagName === "NEXTJS-PORTAL") return null;
        const style = getComputedStyle(element);
        return {
          tag: element.tagName.toLowerCase(),
          name:
            element.getAttribute("aria-label") ??
            (element as HTMLInputElement).labels?.[0]?.textContent?.trim() ??
            (element.textContent?.trim() || element.id),
          visibleFocus:
            style.outlineStyle !== "none" ||
            style.boxShadow !== "none" ||
            element.matches(":focus-visible"),
        };
      });
      if (info) {
        expect(info.visibleFocus, `focus indicator on "${info.name}" (${info.tag})`).toBe(true);
        focusedNames.push(info.name);
      }
      await page.keyboard.press("Tab");
    }
    expect(focusedNames.join(" | ")).toMatch(/Email/i);
    expect(focusedNames.join(" | ")).toMatch(/Sign in/i);
  });
});

test.describe("error pages and response headers", () => {
  test("an unknown page explains what happened and offers a way back", async ({ page }) => {
    const response = await page.goto("/this-page-does-not-exist");
    expect(response?.status()).toBe(404);
    await expect(page.getByRole("heading", { level: 1, name: "We couldn’t find that page" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Go to your projects" })).toBeVisible();
    await expect(page).toHaveTitle(/Page not found/);
    const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
    expect(results.violations).toEqual([]);
    await expect(page.locator("body")).not.toContainText(/stack|TypeError|digest/i);
  });

  test("pages can’t be framed or sniffed, and secret-bearing links never leak as referrers", async ({
    request,
  }) => {
    const signIn = await request.get("/sign-in");
    expect(signIn.headers()["x-frame-options"]).toBe("DENY");
    expect(signIn.headers()["content-security-policy"]).toContain("frame-ancestors 'none'");
    expect(signIn.headers()["x-content-type-options"]).toBe("nosniff");
    expect(signIn.headers()["x-powered-by"]).toBeUndefined();

    const guest = await request.get("/r/not-a-real-token");
    expect(guest.headers()["referrer-policy"]).toBe("no-referrer");
    expect(guest.headers()["x-robots-tag"]).toContain("noindex");

    const invite = await request.get("/invite/not-a-real-token");
    expect(invite.headers()["referrer-policy"]).toBe("no-referrer");
  });

  test("the private API refuses visitors who aren’t signed in without revealing anything", async ({
    request,
  }) => {
    const fakeId = "00000000-0000-4000-8000-000000000000";
    for (const path of [
      `/api/projects/${fakeId}/reviews/${fakeId}/issues/export?format=csv`,
      `/api/projects/${fakeId}/reviews/${fakeId}/issues/1/screenshot`,
      `/api/video/issues/${fakeId}`,
    ]) {
      const response = await request.get(path);
      expect([401, 403, 404], path).toContain(response.status());
      expect(await response.text()).not.toMatch(/stack|select |postgres|at \w+ \(/i);
    }
    const upload = await request.post("/api/video/uploads", { data: {} });
    expect([401, 403]).toContain(upload.status());
  });

  test("the SDK endpoints reject calls with no session and never use a wildcard origin", async ({
    request,
  }) => {
    const issues = await request.get("/api/sdk/v1/issues?pageUrl=https://example.com/", {
      headers: { Origin: "https://evil.example" },
    });
    expect(issues.status()).toBeGreaterThanOrEqual(400);
    expect(issues.headers()["access-control-allow-origin"]).not.toBe("*");

    const preflight = await request.fetch("/api/sdk/v1/issues", {
      method: "OPTIONS",
      headers: { Origin: "https://customer.example", "Access-Control-Request-Method": "POST" },
    });
    expect(preflight.headers()["access-control-allow-origin"]).not.toBe("*");
  });
});

test.describe("guest links and workspace isolation", () => {
  test("a guest link opens for the guest and stops working the moment it is turned off", async ({
    browser,
    request,
  }) => {
    test.setTimeout(180_000);
    const owner = await newSignedInUser(browser, "revoke");
    const seeded = await request.post("/api/test/seed-review-issue", {
      data: {
        ownerEmail: owner.email,
        createReview: true,
        projectName: "Revoke Project",
        reviewName: "Revoke review",
        websiteUrl: "https://example.com/start",
        issueBody: "Logo is blurry",
        screenshotStatus: "ready",
      },
    });
    expect(seeded.ok()).toBeTruthy();
    const { projectId, reviewId } = (await seeded.json()) as { projectId: string; reviewId: string };

    await owner.page.goto(`/projects/${projectId}/reviews/${reviewId}`);
    await owner.page.getByRole("button", { name: "Share review" }).click();
    const dialog = owner.page.getByRole("dialog");
    await dialog.getByRole("button", { name: "Create guest link" }).click();
    await expect(dialog).toContainText("Share link ready");
    const link = (await dialog.locator("p.break-all").innerText()).trim();
    expect(new URL(link).pathname).toMatch(/^\/r\/.+/);

    const guestContext = await browser.newContext();
    const guest = await guestContext.newPage();
    const guestResponse = await guest.goto(new URL(link).pathname);
    expect(guestResponse?.headers()["referrer-policy"]).toBe("no-referrer");
    expect(guestResponse?.headers()["cache-control"] ?? "").not.toMatch(/public|s-maxage/);
    await expect(guest.getByRole("heading", { level: 1 })).toContainText(/Open|Revoke review/i);
    await expect(guest.getByRole("heading", { name: /turned off|unavailable|expired/i })).toHaveCount(0);

    await dialog.getByRole("button", { name: "Turn off" }).click();
    await expect(dialog).toContainText("That guest link was turned off.");

    await guest.reload();
    await expect(guest.getByRole("heading", { level: 1, name: "Review link turned off" })).toBeVisible();
    const results = await new AxeBuilder({ page: guest }).withTags(WCAG_TAGS).analyze();
    expect(results.violations).toEqual([]);

    await guestContext.close();
    await owner.context.close();
  });

  test("another workspace can’t open, export, or fetch anything from a project it doesn’t belong to", async ({
    browser,
    request,
  }) => {
    test.setTimeout(240_000);
    const alice = await newSignedInUser(browser, "alice");
    const seeded = await request.post("/api/test/seed-review-issue", {
      data: {
        ownerEmail: alice.email,
        createReview: true,
        projectName: "Alice private project",
        reviewName: "Alice private review",
        websiteUrl: "https://example.com/start",
        issueBody: "Alice secret feedback",
        screenshotStatus: "ready",
      },
    });
    expect(seeded.ok()).toBeTruthy();
    const { projectId, reviewId, issueNumber } = (await seeded.json()) as {
      projectId: string;
      reviewId: string;
      issueNumber: number;
    };

    // Alice can see her own work.
    await alice.page.goto(`/projects/${projectId}/reviews/${reviewId}/issues/${issueNumber}`);
    await expect(alice.page.getByText("Alice secret feedback").first()).toBeVisible();

    const bob = await newSignedInUser(browser, "bob");
    for (const path of [
      `/projects/${projectId}`,
      `/projects/${projectId}/reviews/${reviewId}`,
      `/projects/${projectId}/reviews/${reviewId}/issues/${issueNumber}`,
    ]) {
      const response = await bob.page.goto(path);
      // Pages explain "not available" in plain words (and still render the signed-in shell);
      // what matters is that nothing from the other workspace comes through.
      expect(response?.status(), path).toBeLessThan(500);
      await expect(bob.page.getByRole("heading", { name: /isn.t available|unavailable|couldn.t find|not found/i }).first(), path).toBeVisible();
      await expect(bob.page.locator("body"), path).not.toContainText(/Alice|secret feedback/);
    }

    const apiPaths = [
      `/api/projects/${projectId}/reviews/${reviewId}/issues/export?format=csv`,
      `/api/projects/${projectId}/reviews/${reviewId}/issues/export?format=md&replies=1`,
      `/api/projects/${projectId}/reviews/${reviewId}/issues/${issueNumber}/screenshot`,
    ];
    for (const path of apiPaths) {
      const response = await bob.context.request.get(path);
      expect(response.status(), path).toBe(404);
      expect(await response.text(), path).not.toContain("Alice");
    }

    // Alice, by contrast, gets her own export.
    const own = await alice.context.request.get(apiPaths[0]);
    expect(own.status()).toBe(200);
    expect(await own.text()).toContain("Alice secret feedback");

    await alice.context.close();
    await bob.context.close();
  });
});

test.describe("signed-in pages", () => {
  test("every main page has one h1, a unique title, no WCAG 2.2 AA violations, and fits 320px and 1440px", async ({
    browser,
    request,
  }) => {
    test.setTimeout(300_000);
    const user = await newSignedInUser(browser, "pages");
    const seeded = await request.post("/api/test/seed-review-issue", {
      data: {
        ownerEmail: user.email,
        createReview: true,
        projectName: "Pages Project",
        reviewName: "Pages review",
        websiteUrl: "https://example.com/start",
        issueBody: "Button label is unclear",
        screenshotStatus: "ready",
      },
    });
    expect(seeded.ok()).toBeTruthy();
    const { projectId, reviewId, issueNumber } = (await seeded.json()) as {
      projectId: string;
      reviewId: string;
      issueNumber: number;
    };

    const paths = [
      "/dashboard",
      "/notifications",
      "/usability",
      "/settings/account",
      "/settings/workspace",
      "/settings/members",
      "/settings/billing",
      "/settings/notifications",
      "/settings/webhooks",
      `/projects/${projectId}`,
      `/projects/${projectId}/reviews/${reviewId}`,
      `/projects/${projectId}/reviews/${reviewId}/issues/${issueNumber}`,
    ];

    const titles = new Map<string, string>();
    for (const width of [320, 1440]) {
      await user.page.setViewportSize({ width, height: 900 });
      for (const path of paths) {
        const response = await user.page.goto(path);
        expect(response?.status(), path).toBe(200);
        await expect(user.page.locator("h1"), `${path} @${width}`).toHaveCount(1);
        const title = await user.page.title();
        if (width === 320) {
          expect(titles.get(title), `${path} repeats the title of ${titles.get(title)}`).toBeUndefined();
          titles.set(title, path);
        }
        await user.page.waitForLoadState("networkidle");
        const overflowing = await hasHorizontalScroll(user.page);
        expect(
          overflowing ? await wideElements(user.page) : [],
          `${path} scrolls sideways at ${width}px`,
        ).toEqual([]);
        expect(overflowing, `${path} scrolls sideways at ${width}px`).toBe(false);
        const results = await new AxeBuilder({ page: user.page }).withTags(WCAG_TAGS).analyze();
        expect(
          results.violations.map((violation) => `${violation.id}: ${violation.help}`),
          `${path} at ${width}px`,
        ).toEqual([]);
      }
    }
    await user.context.close();
  });

  test("private pages send visitors who are signed out to sign in and back", async ({ page }) => {
    for (const path of ["/dashboard", "/settings/members", "/usability", "/notifications"]) {
      await page.goto(path);
      await expect(page, path).toHaveURL(/\/sign-in/);
    }
  });
});

