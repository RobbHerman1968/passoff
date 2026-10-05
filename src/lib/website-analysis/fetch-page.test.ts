import { describe, expect, it, vi } from "vitest";

import {
  createPinnedLookup,
  fetchPageForAnalysis,
} from "@/lib/website-analysis/fetch-page";

describe("fetchPageForAnalysis", () => {
  it("rejects redirects outside the allowed origin", async () => {
    const requestFn = vi
      .fn()
      .mockResolvedValueOnce({
        statusCode: 302,
        headers: { location: "https://evil.example/phish" },
        body: Buffer.from(""),
        url: new URL("https://example.com/"),
      });

    const result = await fetchPageForAnalysis({
      startingUrl: "https://example.com/",
      allowedOrigins: ["https://example.com"],
      lookup: async () => [{ address: "93.184.216.34", family: 4 }],
      requestFn,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("origin_not_allowed");
  });

  it("returns timeout failures safely", async () => {
    const requestFn = vi.fn().mockRejectedValue(
      Object.assign(new Error("timeout"), { code: "timeout" }),
    );

    const result = await fetchPageForAnalysis({
      startingUrl: "https://example.com/",
      allowedOrigins: ["https://example.com"],
      lookup: async () => [{ address: "93.184.216.34", family: 4 }],
      requestFn,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("timeout");
      expect(result.message).toMatch(/too long/i);
    }
  });

  it("returns oversized response failures safely", async () => {
    const requestFn = vi.fn().mockRejectedValue(
      Object.assign(new Error("response_too_large"), {
        code: "response_too_large",
      }),
    );

    const result = await fetchPageForAnalysis({
      startingUrl: "https://example.com/",
      allowedOrigins: ["https://example.com"],
      lookup: async () => [{ address: "93.184.216.34", family: 4 }],
      requestFn,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("response_too_large");
  });

  it("rejects private IP targets before connecting", async () => {
    const requestFn = vi.fn();
    const result = await fetchPageForAnalysis({
      startingUrl: "http://127.0.0.1/",
      allowedOrigins: ["http://127.0.0.1"],
      requestFn,
    });
    expect(result.ok).toBe(false);
    expect(requestFn).not.toHaveBeenCalled();
  });

  it("accepts HTML pages inside allowed origins", async () => {
    const requestFn = vi.fn().mockResolvedValue({
      statusCode: 200,
      headers: { "content-type": "text/html; charset=utf-8" },
      body: Buffer.from("<html><body>ok</body></html>"),
      url: new URL("https://example.com/"),
    });

    const result = await fetchPageForAnalysis({
      startingUrl: "https://example.com/",
      allowedOrigins: ["https://example.com"],
      lookup: async () => [{ address: "93.184.216.34", family: 4 }],
      requestFn,
    });

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.page.body).toContain("ok");
  });

  it("supports Node's all:true custom DNS lookup callback shape", async () => {
    const lookup = createPinnedLookup({
      address: "216.150.16.1",
      family: 4,
    });

    const allResult = await new Promise<{
      err: Error | null;
      value: unknown;
    }>((resolve) => {
      lookup(
        "www.precisionfoundry.io",
        { all: true, hints: 1024 },
        (err, value) => resolve({ err, value }),
      );
    });
    expect(allResult.err).toBeNull();
    expect(allResult.value).toEqual([
      { address: "216.150.16.1", family: 4 },
    ]);

    const singleResult = await new Promise<{
      err: Error | null;
      value: unknown;
      family?: number;
    }>((resolve) => {
      lookup("www.precisionfoundry.io", {}, (err, value, family) =>
        resolve({ err, value, family }),
      );
    });
    expect(singleResult.err).toBeNull();
    expect(singleResult.value).toBe("216.150.16.1");
    expect(singleResult.family).toBe(4);
  });
});
