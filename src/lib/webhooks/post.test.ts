// @vitest-environment node
import http from "node:http";
import type { AddressInfo } from "node:net";

import { afterEach, describe, expect, it } from "vitest";

import { postToPinnedAddress } from "@/lib/webhooks/post";

let server: http.Server | null = null;

afterEach(async () => {
  await new Promise<void>((resolve) => (server ? server.close(() => resolve()) : resolve()));
  server = null;
});

function listen(handler: http.RequestListener) {
  return new Promise<number>((resolve) => {
    server = http.createServer(handler).listen(0, "127.0.0.1", () => {
      resolve((server!.address() as AddressInfo).port);
    });
  });
}

describe("postToPinnedAddress", () => {
  it("connects to the vetted address even when the name cannot be resolved", async () => {
    let seenHost = "";
    let seenBody = "";
    const port = await listen((request, response) => {
      seenHost = request.headers.host ?? "";
      request.on("data", (chunk) => (seenBody += chunk));
      request.on("end", () => response.writeHead(204).end());
    });

    // `.invalid` never resolves. Only the pinned address can make this succeed, which is
    // what stops a name from pointing somewhere else after it was checked.
    const result = await postToPinnedAddress({
      href: `http://hooks.rebind.invalid:${port}/passoff`,
      address: "127.0.0.1",
      family: 4,
      headers: { "Content-Type": "application/json" },
      body: '{"ok":true}',
      timeoutMs: 2_000,
    });

    expect(result.status).toBe(204);
    expect(seenHost).toBe(`hooks.rebind.invalid:${port}`);
    expect(seenBody).toBe('{"ok":true}');
  });

  it("reports redirects instead of following them", async () => {
    let hits = 0;
    const port = await listen((request, response) => {
      hits += 1;
      request.resume();
      response.writeHead(302, { Location: "http://169.254.169.254/latest" }).end();
    });
    const result = await postToPinnedAddress({
      href: `http://example.invalid:${port}/x`,
      address: "127.0.0.1",
      family: 4,
      headers: {},
      body: "{}",
      timeoutMs: 2_000,
    });
    expect(result.status).toBe(302);
    expect(hits).toBe(1);
  });

  it("times out slow endpoints with a TimeoutError", async () => {
    const port = await listen(() => {
      // Never answer.
    });
    await expect(
      postToPinnedAddress({
        href: `http://slow.invalid:${port}/x`,
        address: "127.0.0.1",
        family: 4,
        headers: {},
        body: "{}",
        timeoutMs: 100,
      }),
    ).rejects.toMatchObject({ name: "TimeoutError" });
  });
});
