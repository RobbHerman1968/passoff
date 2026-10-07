import { config as loadEnv } from "dotenv";
import { defineConfig, devices } from "@playwright/test";

import { resolveTestDatabaseUrl } from "./src/db/test-database-guard";

// Same order as the unit-test setup: base secrets first, then test overrides.
loadEnv({ path: ".env" });
loadEnv({ path: ".env.test" });
loadEnv({ path: ".env.test.local", override: true });

// Browser tests drive a real dev server, so that server needs a database. It gets the
// confirmed test database as its DATABASE_URL and never the app's own database.
const testDatabaseUrl = resolveTestDatabaseUrl(process.env);

const port = Number(process.env.PLAYWRIGHT_PORT ?? 3000);
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  // The development server compiles routes on demand; a small CI machine is steadier with fewer at once.
  workers: process.env.CI ? 2 : undefined,
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  webServer: {
    command: `npm run sdk:build && npm run dev -- --hostname 127.0.0.1 --port ${port}`,
    // Use the database-free SDK harness as the readiness probe. The sign-in
    // route can legitimately wait on an external test database before the
    // browser suite itself has started.
    url: `${baseURL}/dev/website-sdk/bare`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      ...process.env,
      DATABASE_URL: testDatabaseUrl,
      EMAIL_TRANSPORT: "test",
      NEXT_PUBLIC_SITE_URL: baseURL,
      PASSOFF_EMBED_BASE_URL: baseURL,
      // Billing runs against a fake payment provider. Browser tests deliver signed webhooks
      // themselves; no real Stripe account, key, or charge is involved.
      PASSOFF_BILLING_GATEWAY: "fake",
      STRIPE_WEBHOOK_SECRET: "whsec_playwright_only_secret",
      STRIPE_PRICE_STUDIO_MONTHLY: "price_test_studio_month",
      STRIPE_PRICE_STUDIO_ANNUAL: "price_test_studio_year",
      STRIPE_PRICE_AGENCY_MONTHLY: "price_test_agency_month",
      STRIPE_PRICE_AGENCY_ANNUAL: "price_test_agency_year",
    },
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
