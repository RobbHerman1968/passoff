// @vitest-environment node
import { describe, expect, it } from "vitest";

import nextConfig from "../../../next.config";
import { appSecurityHeaders, privateLinkHeaders } from "./headers";

function names(headers: Array<{ key: string }>) {
  return headers.map((header) => header.key);
}

describe("security headers", () => {
  it("stops other sites from framing or sniffing Passoff", () => {
    const headers = Object.fromEntries(appSecurityHeaders().map((h) => [h.key, h.value]));
    expect(headers["X-Frame-Options"]).toBe("DENY");
    expect(headers["Content-Security-Policy"]).toContain("frame-ancestors 'none'");
    expect(headers["Content-Security-Policy"]).toContain("object-src 'none'");
    expect(headers["X-Content-Type-Options"]).toBe("nosniff");
    expect(headers["Referrer-Policy"]).toBe("strict-origin-when-cross-origin");
    expect(headers["Permissions-Policy"]).toContain("camera=()");
    expect(headers["Strict-Transport-Security"]).toMatch(/max-age=\d+/);
  });

  it("keeps secret-bearing links out of referrers, caches, and search results", () => {
    const headers = Object.fromEntries(privateLinkHeaders().map((h) => [h.key, h.value]));
    expect(headers["Referrer-Policy"]).toBe("no-referrer");
    expect(headers["Cache-Control"]).toContain("no-store");
    expect(headers["X-Robots-Tag"]).toContain("noindex");
  });

  it("applies the baseline everywhere and the private-link rules to every link-bearing route", async () => {
    const rules = await nextConfig.headers!();
    const everywhere = rules.find((rule) => rule.source === "/:path*");
    expect(names(everywhere!.headers)).toContain("X-Frame-Options");
    for (const source of ["/r/:path*", "/invite/:path*", "/reset-password/:path*"]) {
      const rule = rules.find((candidate) => candidate.source === source);
      expect(rule, source).toBeTruthy();
      expect(names(rule!.headers)).toContain("Referrer-Policy");
    }
  });

  it("keeps the SDK script publicly embeddable but always revalidated", async () => {
    const rules = await nextConfig.headers!();
    const sdk = rules.find((rule) => rule.source === "/sdk/v1/:path*");
    const headers = Object.fromEntries(sdk!.headers.map((h) => [h.key, h.value]));
    expect(headers["Cross-Origin-Resource-Policy"]).toBe("cross-origin");
    expect(headers["Cache-Control"]).toContain("must-revalidate");
  });
});
