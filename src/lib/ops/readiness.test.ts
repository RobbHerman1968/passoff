// @vitest-environment node
import { describe, expect, it } from "vitest";

import { evaluateReadiness, summarizeReadiness } from "./readiness";

const SECRET_VALUES = {
  DATABASE_URL: "postgresql://user:hunter2@db.example.com/app",
  AUTH_SECRET: "a".repeat(40),
  CRON_SECRET: "cron-secret-value",
  PASSOFF_SECRET_ENCRYPTION_KEY: "enc-key-value",
  NEXT_PUBLIC_SITE_URL: "https://app.passoff.example",
  PASSOFF_EMBED_BASE_URL: "https://app.passoff.example",
  EMAIL_TRANSPORT: "resend",
  RESEND_API_KEY: "re_secret",
  EMAIL_FROM: "Passoff <noreply@passoff.example>",
  STRIPE_SECRET_KEY: "sk_live_secret",
  STRIPE_WEBHOOK_SECRET: "whsec_secret",
  STRIPE_PRICE_STUDIO_MONTHLY: "price_1",
  STRIPE_PRICE_STUDIO_ANNUAL: "price_2",
  STRIPE_PRICE_AGENCY_MONTHLY: "price_3",
  STRIPE_PRICE_AGENCY_ANNUAL: "price_4",
  MUX_TOKEN_ID: "mux_id",
  MUX_TOKEN_SECRET: "mux_secret",
  MUX_SIGNING_KEY: "mux_sign",
  MUX_PRIVATE_KEY: "mux_private",
  MUX_WEBHOOK_SECRET: "mux_hook",
};

const production = { NODE_ENV: "production", ...SECRET_VALUES };

describe("evaluateReadiness", () => {
  it("is ready when production is fully configured", () => {
    const checks = evaluateReadiness(production);
    expect(summarizeReadiness(checks)).toEqual({ ready: true, problems: 0, warnings: 0 });
  });

  it("never includes a configured value in its output", () => {
    const text = JSON.stringify(evaluateReadiness({ ...production, EMAIL_TRANSPORT: "none" }));
    for (const value of Object.values(SECRET_VALUES)) {
      expect(text).not.toContain(value);
    }
  });

  it("flags every unsafe production setting", () => {
    const checks = evaluateReadiness({
      NODE_ENV: "production",
      EMAIL_TRANSPORT: "test",
      PASSOFF_BILLING_GATEWAY: "fake",
      NEXT_PUBLIC_SITE_URL: "http://localhost:3000",
      TEST_DATABASE_URL: "postgresql://x",
    });
    const problems = checks.filter((check) => check.level === "problem").map((check) => check.id);
    expect(problems).toEqual(
      expect.arrayContaining([
        "database",
        "auth_secret",
        "cron_secret",
        "site_url",
        "email",
        "billing_gateway",
      ]),
    );
    expect(checks.find((check) => check.id === "test_database")?.level).toBe("warning");
  });

  it("explains missing video signing and webhook settings", () => {
    const { MUX_SIGNING_KEY: _a, MUX_WEBHOOK_SECRET: _b, ...rest } = production;
    void _a;
    void _b;
    const checks = evaluateReadiness(rest);
    expect(checks.find((check) => check.id === "video_playback")?.level).toBe("problem");
    expect(checks.find((check) => check.id === "video_webhook")?.level).toBe("problem");
  });

  it("treats missing optional providers as warnings, not problems", () => {
    const checks = evaluateReadiness({
      ...production,
      STRIPE_SECRET_KEY: "",
      MUX_TOKEN_ID: "",
      PASSOFF_SECRET_ENCRYPTION_KEY: "",
    });
    expect(summarizeReadiness(checks).ready).toBe(true);
    expect(checks.find((check) => check.id === "billing")?.level).toBe("warning");
    expect(checks.find((check) => check.id === "video")?.level).toBe("warning");
    expect(checks.find((check) => check.id === "secret_encryption_key")?.level).toBe("warning");
  });
});
