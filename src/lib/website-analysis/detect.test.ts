import { describe, expect, it } from "vitest";

import {
  collectPageSignals,
  cspAllowsExternalScriptHost,
  pickDeterministicPlatform,
} from "@/lib/website-analysis/detect";
import { FIXTURE_HTML, STRICT_CSP } from "@/lib/website-analysis/fixtures";

function analyze(
  html: string,
  headers: Record<string, string> = { "content-type": "text/html" },
  options?: { passoffScriptHost?: string },
) {
  return collectPageSignals({
    finalUrl: "https://example.com/",
    contentType: headers["content-type"] ?? "text/html",
    headers,
    body: html,
    passoffScriptHost: options?.passoffScriptHost,
  });
}

describe("deterministic website detection", () => {
  it.each([
    ["nextjs", "nextjs"],
    ["wordpress", "wordpress"],
    ["shopify", "shopify"],
    ["webflow", "webflow"],
    ["squarespace", "squarespace"],
    ["wix", "wix"],
    ["framer", "framer"],
    ["gtm", "gtm"],
    ["genericHtml", "generic_html"],
  ] as const)("detects %s", (fixture, platform) => {
    const { evidence } = analyze(FIXTURE_HTML[fixture]);
    const picked = pickDeterministicPlatform(evidence);
    expect(picked.platform).toBe(platform);
  });

  it("marks conflicting platform signals as low confidence", () => {
    const { evidence } = analyze(FIXTURE_HTML.conflicting);
    expect(evidence.conflictingEvidence.length).toBeGreaterThan(0);
    const picked = pickDeterministicPlatform(evidence);
    expect(picked.confidence).toBe("low");
  });

  it("detects an existing Passoff installation", () => {
    const { evidence } = analyze(FIXTURE_HTML.existingPassoff);
    expect(evidence.hasPassoffScript).toBe(true);
  });

  it("summarizes strict CSP constraints", () => {
    const { evidence } = analyze(FIXTURE_HTML.genericHtml, {
      "content-type": "text/html",
      "content-security-policy": STRICT_CSP,
    });
    expect(evidence.csp.present).toBe(true);
    expect(evidence.csp.blocksInlineScripts).toBe(true);
    expect(evidence.csp.restrictsThirdPartyScripts).toBe(true);
    expect(
      evidence.analyzerWarnings.some((warning) =>
        /content security policy/i.test(warning),
      ),
    ).toBe(true);
  });

  it("names the Passoff script host when CSP would block it", () => {
    const { evidence } = analyze(
      FIXTURE_HTML.genericHtml,
      {
        "content-type": "text/html",
        "content-security-policy":
          "default-src 'self'; script-src 'self' 'unsafe-inline' https://js.stripe.com",
      },
      { passoffScriptHost: "127.0.0.1" },
    );
    expect(
      evidence.analyzerWarnings.some((warning) =>
        /does not allow scripts from 127\.0\.0\.1/i.test(warning),
      ),
    ).toBe(true);
  });

  it("reads CSP from a meta http-equiv tag", () => {
    const html = `<html><head><meta http-equiv="Content-Security-Policy" content="script-src 'self'"></head><body></body></html>`;
    const { evidence } = analyze(html, { "content-type": "text/html" });
    expect(evidence.csp.present).toBe(true);
    expect(evidence.csp.restrictsThirdPartyScripts).toBe(true);
  });

  it("matches CSP host allowlists for external scripts", () => {
    expect(
      cspAllowsExternalScriptHost(
        ["'self'", "https://cdn.passoff.io"],
        "cdn.passoff.io",
      ),
    ).toBe(true);
    expect(
      cspAllowsExternalScriptHost(
        ["'self'", "https://*.passoff.io"],
        "cdn.passoff.io",
      ),
    ).toBe(true);
    expect(
      cspAllowsExternalScriptHost(["'self'", "https://js.stripe.com"], "cdn.passoff.io"),
    ).toBe(false);
  });

  it("flags authenticated lookalike pages", () => {
    const { evidence } = analyze(FIXTURE_HTML.authenticatedLookalike);
    expect(evidence.appearsAuthenticated).toBe(true);
  });

  it("redacts prompt-injection generator text from OpenAI evidence", () => {
    const { evidence } = analyze(FIXTURE_HTML.promptInjection);
    expect(evidence.metaGenerator).toBe("[redacted untrusted generator text]");
    expect(JSON.stringify(evidence)).not.toMatch(/Ignore previous instructions/i);
  });

  it("strips query strings from asset URLs before evidence serialization", () => {
    const html = `<script src="https://cdn.example.com/app.js?token=secret"></script>`;
    const { evidence } = analyze(html);
    expect(evidence.scriptAssets[0]?.path).toBe("/app.js");
    expect(JSON.stringify(evidence)).not.toContain("token=secret");
  });
});
