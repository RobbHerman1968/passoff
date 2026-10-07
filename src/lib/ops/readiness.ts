/**
 * Checks that the deployment is configured safely. It reports which settings are missing
 * or unsafe, never their values, so the result can be shown to support or logged.
 */

type Env = Record<string, string | undefined>;

export type ReadinessLevel = "ok" | "warning" | "problem";

export type ReadinessCheck = {
  id: string;
  level: ReadinessLevel;
  /** Plain explanation. Never contains a configured value. */
  note: string;
};

function present(env: Env, key: string) {
  return Boolean(env[key]?.trim());
}

export function evaluateReadiness(env: Env): ReadinessCheck[] {
  const production = env.NODE_ENV === "production";
  const checks: ReadinessCheck[] = [];
  const add = (id: string, level: ReadinessLevel, note: string) => checks.push({ id, level, note });

  add(
    "database",
    present(env, "DATABASE_URL") ? "ok" : "problem",
    present(env, "DATABASE_URL") ? "Database is configured." : "DATABASE_URL is missing.",
  );

  const authSecret = env.AUTH_SECRET?.trim() ?? "";
  add(
    "auth_secret",
    authSecret.length >= 32 ? "ok" : "problem",
    authSecret.length >= 32
      ? "Sign-in secret is set."
      : "AUTH_SECRET is missing or shorter than 32 characters.",
  );

  add(
    "cron_secret",
    present(env, "CRON_SECRET") ? "ok" : production ? "problem" : "warning",
    present(env, "CRON_SECRET")
      ? "Scheduled jobs are protected."
      : "CRON_SECRET is missing, so every scheduled job (webhook delivery, reminders, retention, deletion, billing notices) is refused in production.",
  );

  add(
    "secret_encryption_key",
    present(env, "PASSOFF_SECRET_ENCRYPTION_KEY") ? "ok" : production ? "warning" : "ok",
    present(env, "PASSOFF_SECRET_ENCRYPTION_KEY")
      ? "Webhook signing secrets use their own encryption key."
      : "PASSOFF_SECRET_ENCRYPTION_KEY is not set, so webhook secrets are encrypted with the sign-in secret. Rotating one then rotates both.",
  );

  const site = env.NEXT_PUBLIC_SITE_URL?.trim() ?? "";
  const siteOk = production
    ? site.startsWith("https://") && !/localhost|127\.0\.0\.1/.test(site)
    : Boolean(site);
  add(
    "site_url",
    siteOk ? "ok" : "problem",
    siteOk
      ? "Public site address is set."
      : "NEXT_PUBLIC_SITE_URL must be the public https address (it is used in emails, share links, and Stripe return links).",
  );

  add(
    "embed_url",
    present(env, "PASSOFF_EMBED_BASE_URL") ? "ok" : "warning",
    present(env, "PASSOFF_EMBED_BASE_URL")
      ? "Website install snippets use a configured address."
      : "PASSOFF_EMBED_BASE_URL is missing, so install snippets fall back to the site address.",
  );

  const mode = env.EMAIL_TRANSPORT?.trim().toLowerCase();
  if (mode === "test") {
    add(
      "email",
      production ? "problem" : "ok",
      production
        ? "EMAIL_TRANSPORT=test is not allowed in production."
        : "Email is captured in memory for tests.",
    );
  } else if (mode === "resend") {
    const ready = present(env, "RESEND_API_KEY") && present(env, "EMAIL_FROM");
    add(
      "email",
      ready ? "ok" : "problem",
      ready ? "Email delivery is configured." : "EMAIL_TRANSPORT=resend needs RESEND_API_KEY and EMAIL_FROM.",
    );
  } else {
    add(
      "email",
      production ? "problem" : "warning",
      "Email is turned off, so invitations, password resets, and notices are not delivered.",
    );
  }

  const stripeReady =
    present(env, "STRIPE_SECRET_KEY") &&
    present(env, "STRIPE_WEBHOOK_SECRET") &&
    ["STUDIO_MONTHLY", "STUDIO_ANNUAL", "AGENCY_MONTHLY", "AGENCY_ANNUAL"].every((suffix) =>
      present(env, `STRIPE_PRICE_${suffix}`),
    );
  add(
    "billing",
    stripeReady ? "ok" : "warning",
    stripeReady
      ? "Stripe keys, webhook secret, and all four prices are set."
      : "Stripe is not fully configured. Checkout stays unavailable; existing plans keep working.",
  );
  if (env.PASSOFF_BILLING_GATEWAY === "fake") {
    add(
      "billing_gateway",
      production ? "problem" : "ok",
      production
        ? "PASSOFF_BILLING_GATEWAY=fake must not be set in production."
        : "Fake billing gateway is on for tests.",
    );
  }

  const muxReady = present(env, "MUX_TOKEN_ID") && present(env, "MUX_TOKEN_SECRET");
  add(
    "video",
    muxReady ? "ok" : "warning",
    muxReady ? "Video storage is configured." : "Mux is not configured, so video uploads are unavailable.",
  );
  if (muxReady) {
    const playbackReady =
      present(env, "MUX_SIGNING_KEY") && present(env, "MUX_PRIVATE_KEY");
    add(
      "video_playback",
      playbackReady ? "ok" : "problem",
      playbackReady
        ? "Signed video playback is configured."
        : "MUX_SIGNING_KEY and MUX_PRIVATE_KEY are missing, so no clip can be played.",
    );
    add(
      "video_webhook",
      present(env, "MUX_WEBHOOK_SECRET") ? "ok" : "problem",
      present(env, "MUX_WEBHOOK_SECRET")
        ? "Video processing notices are verified."
        : "MUX_WEBHOOK_SECRET is missing, so uploaded clips never finish processing.",
    );
  }

  if (production && present(env, "TEST_DATABASE_URL")) {
    add(
      "test_database",
      "warning",
      "TEST_DATABASE_URL is set in production. Remove it; production never needs it.",
    );
  }
  if (env.PASSOFF_TELEMETRY_KILL_SWITCH === "true") {
    add("telemetry_kill_switch", "warning", "Visitor usability collection is switched off.");
  }

  return checks;
}

export function summarizeReadiness(checks: ReadinessCheck[]) {
  const problems = checks.filter((check) => check.level === "problem").length;
  const warnings = checks.filter((check) => check.level === "warning").length;
  return { ready: problems === 0, problems, warnings };
}
