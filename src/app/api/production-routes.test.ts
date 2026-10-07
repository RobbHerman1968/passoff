// @vitest-environment node
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Production route safety. Two layers:
 *
 * 1. An inventory: every API route must be classified, and each class must reference its
 *    guard. A new route that is not classified fails this test until someone decides how
 *    it is protected.
 * 2. Behavior: with production settings, test routes are closed, cron routes refuse
 *    everything without the secret, and the Stripe and Mux webhooks refuse unsigned posts.
 */

const API_ROOT = path.resolve(__dirname);

function routeFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return routeFiles(full);
    return name === "route.ts" ? [full] : [];
  });
}

type Guard = { name: string; tokens: string[] };

const CLASSES: Record<string, Guard> = {
  cron: { name: "cron bearer secret", tokens: ["runCronJob"] },
  test: { name: "test-only gate", tokens: ["testRoutesEnabled"] },
  workspace: { name: "signed-in workspace member", tokens: ["requireWorkspaceContext"] },
  sdk: {
    name: "SDK session or installation key",
    tokens: [
      "resolveSdkSession",
      "exchangeSdkSession",
      "ingestTelemetryBatch",
      "verifyWebsiteInstallation",
      "resolveVerificationSession",
      "exchangeVerificationSession",
    ],
  },
  signedWebhook: { name: "provider signature", tokens: ["constructEvent", "unwrap"] },
  video: { name: "video playback authorization", tokens: ["authorizeVideoPlayback"] },
  authjs: { name: "Auth.js handlers", tokens: ["handlers"] },
  devOnly: { name: "development only", tokens: ['NODE_ENV === "production"'] },
  public: { name: "intentionally public", tokens: [] },
};

function classify(relative: string): keyof typeof CLASSES {
  if (relative.startsWith("cron/")) return "cron";
  if (relative.startsWith("test/")) return "test";
  if (relative.startsWith("dev/")) return "devOnly";
  if (relative.startsWith("sdk/")) return "sdk";
  if (relative.startsWith("webhooks/")) return "signedWebhook";
  if (relative.startsWith("auth/")) return "authjs";
  if (relative.startsWith("projects/") || relative.startsWith("video/uploads") || relative.startsWith("video/issues")) {
    return "workspace";
  }
  if (relative.startsWith("video/")) return "video";
  if (relative === "version/route.ts" || relative === "health/route.ts") return "public";
  throw new Error(`Unclassified API route: ${relative}. Decide how it is protected and add it here.`);
}

describe("API route inventory", () => {
  const files = routeFiles(API_ROOT)
    .map((file) => path.relative(API_ROOT, file).split(path.sep).join("/"))
    // The inventory test itself and its helpers live beside the routes.
    .sort();

  it("finds the routes", () => {
    expect(files.length).toBeGreaterThan(25);
  });

  for (const relative of files) {
    it(`${relative} references its guard`, () => {
      const kind = classify(relative);
      const guard = CLASSES[kind];
      const source = readFileSync(path.join(API_ROOT, relative), "utf8");
      if (guard.tokens.length === 0) return;
      expect(
        guard.tokens.some((token) => source.includes(token)),
        `${relative} must use ${guard.name}`,
      ).toBe(true);
    });
  }

  it("keeps the public routes to a short, reviewed list", () => {
    const publicRoutes = files.filter((relative) => classify(relative) === "public");
    expect(publicRoutes).toEqual(["health/route.ts", "version/route.ts"]);
  });

  it("never exposes secrets or database details from the public version route", () => {
    const source = readFileSync(path.join(API_ROOT, "version/route.ts"), "utf8");
    expect(source).not.toMatch(/process\.env/);
  });

  it("only shows configuration detail on the health route to the scheduled-job secret", () => {
    const source = readFileSync(path.join(API_ROOT, "health/route.ts"), "utf8");
    expect(source).toContain("isAuthorizedCronRequest");
    expect(source.indexOf("isAuthorizedCronRequest(request)")).toBeLessThan(
      source.indexOf("evaluateReadiness(process.env)"),
    );
  });
});

describe("test routes in production", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  const cases: Array<{ file: string; method: "GET" | "POST"; url: string }> = [
    { file: "add-team-member", method: "POST", url: "http://x/api/test/add-team-member" },
    { file: "billing-state", method: "GET", url: "http://x/api/test/billing-state?ownerEmail=a@b.co" },
    { file: "create-reset-token", method: "POST", url: "http://x/api/test/create-reset-token" },
    { file: "last-invitation-link", method: "GET", url: "http://x/api/test/last-invitation-link?email=a@b.co" },
    { file: "last-reset-link", method: "GET", url: "http://x/api/test/last-reset-link?email=a@b.co" },
    { file: "seed-review-issue", method: "POST", url: "http://x/api/test/seed-review-issue" },
    { file: "seed-subscription", method: "POST", url: "http://x/api/test/seed-subscription" },
  ];

  it("covers every test route", () => {
    const onDisk = readdirSync(path.join(API_ROOT, "test")).sort();
    expect(cases.map((c) => c.file).sort()).toEqual(onDisk);
  });

  for (const testCase of cases) {
    it(`${testCase.file} answers 404 in production even with EMAIL_TRANSPORT=test`, async () => {
      vi.stubEnv("NODE_ENV", "production");
      vi.stubEnv("EMAIL_TRANSPORT", "test");
      const routeModule = await import(/* @vite-ignore */ `./test/${testCase.file}/route`);
      const handler = routeModule[testCase.method] as (request: Request) => Promise<Response>;
      const response = await handler(
        new Request(testCase.url, {
          method: testCase.method,
          body: testCase.method === "POST" ? JSON.stringify({ ownerEmail: "a@b.co" }) : undefined,
        }),
      );
      expect(response.status).toBe(404);
    });
  }
});

describe("cron routes in production", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  const crons = ["billing", "reminders", "telemetry", "video", "webhooks", "workspaces"];

  it("covers every cron route and every schedule in vercel.json", () => {
    expect(readdirSync(path.join(API_ROOT, "cron")).sort()).toEqual([...crons].sort());
    const config = JSON.parse(readFileSync(path.resolve(__dirname, "../../../vercel.json"), "utf8")) as {
      crons: Array<{ path: string }>;
    };
    const scheduled = new Set(config.crons.map((entry) => entry.path.replace("/api/cron/", "")));
    expect([...scheduled].sort()).toEqual([...crons].sort());
  });

  for (const name of crons) {
    for (const method of ["GET", "POST"] as const) {
      it(`${name} ${method} refuses a missing secret configuration and wrong credentials`, async () => {
        const routeModule = await import(/* @vite-ignore */ `./cron/${name}/route`);
        const handler = routeModule[method] as (request: Request) => Promise<Response>;

        vi.stubEnv("NODE_ENV", "production");
        vi.stubEnv("CRON_SECRET", "");
        const unconfigured = await handler(
          new Request(`http://x/api/cron/${name}`, {
            method,
            headers: { authorization: "Bearer " },
          }),
        );
        expect(unconfigured.status).toBe(401);

        vi.stubEnv("CRON_SECRET", "a-long-random-secret");
        for (const headers of [
          {},
          { authorization: "Bearer wrong" },
          { authorization: "a-long-random-secret" },
          { "x-vercel-cron": "1" },
        ] as Array<Record<string, string>>) {
          const response = await handler(
            new Request(`http://x/api/cron/${name}?secret=a-long-random-secret`, { method, headers }),
          );
          expect(response.status).toBe(401);
          expect(await response.json()).toEqual({ ok: false });
        }
      });
    }
  }
});

describe("webhooks reject forged requests", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("Stripe refuses a post with no signature and a post with a forged signature", async () => {
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", "whsec_route_safety");
    const { POST } = await import("./webhooks/stripe/route");
    const body = JSON.stringify({ id: "evt_forged", type: "customer.subscription.updated" });

    const unsigned = await POST(new Request("http://x/api/webhooks/stripe", { method: "POST", body }));
    expect(unsigned.status).toBe(400);

    const forged = await POST(
      new Request("http://x/api/webhooks/stripe", {
        method: "POST",
        body,
        headers: { "stripe-signature": "t=1,v1=deadbeef" },
      }),
    );
    expect(forged.status).toBe(400);
    expect(await forged.text()).not.toContain("whsec_");
  });

  it("Mux refuses a post with no signature and a post with a forged signature", async () => {
    vi.stubEnv("MUX_WEBHOOK_SECRET", "mux_route_safety");
    const { POST } = await import("./webhooks/mux/route");
    const body = JSON.stringify({ type: "video.asset.ready", data: { id: "asset" } });

    const unsigned = await POST(new Request("http://x/api/webhooks/mux", { method: "POST", body }));
    expect(unsigned.status).toBe(400);

    const forged = await POST(
      new Request("http://x/api/webhooks/mux", {
        method: "POST",
        body,
        headers: { "mux-signature": "t=1,v1=deadbeef" },
      }),
    );
    expect(forged.status).toBe(400);
  });
});

describe("development-only routes in production", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("the session-clearing helper is closed", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const { GET } = await import("./dev/clear-session/route");
    const response = await GET(new Request("http://x/api/dev/clear-session"));
    expect(response.status).toBe(404);
  });
});
