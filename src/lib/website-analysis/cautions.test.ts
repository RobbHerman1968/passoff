import { describe, expect, it } from "vitest";

import {
  applyCspGuidanceToResult,
  mergeInstallationCautions,
} from "@/lib/website-analysis/cautions";
import { collectPageSignals } from "@/lib/website-analysis/detect";
import { FIXTURE_HTML } from "@/lib/website-analysis/fixtures";
import { buildResultFromTemplate } from "@/lib/website-analysis/templates";

describe("mergeInstallationCautions", () => {
  it("keeps the most actionable CSP warning and drops duplicates", () => {
    const merged = mergeInstallationCautions(
      [
        "If a content security policy is set, allow the Passoff script host.",
        "Load Passoff only in environments you intend to review.",
      ],
      [
        "A Content Security Policy is present and may restrict third-party scripts.",
        "Inline scripts are not blocked by CSP according to the evidence, but third-party script hosts are restricted.",
        "Google Tag Manager is already present; avoid duplicate installation if Passoff is being added through GTM elsewhere.",
      ],
      [
        "A content security policy may restrict third-party scripts such as Passoff.",
        "This site’s content security policy does not allow scripts from 127.0.0.1. Add that host to script-src before Passoff can load.",
      ],
    );

    expect(merged.filter((item) => /content security policy|\bcsp\b/i.test(item))).toHaveLength(
      1,
    );
    expect(merged[0]).toMatch(/does not allow scripts from 127\.0\.0\.1/i);
    expect(merged).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/Google Tag Manager/i),
        expect.stringMatching(/environments you intend to review/i),
      ]),
    );
  });

  it("deduplicates identical non-CSP cautions", () => {
    const merged = mergeInstallationCautions(
      ["Load Passoff only in environments you intend to review."],
      ["Load Passoff only in environments you intend to review."],
    );
    expect(merged).toEqual([
      "Load Passoff only in environments you intend to review.",
    ]);
  });

  it("adds an explicit CSP update step when the policy blocks Passoff", () => {
    const { evidence } = collectPageSignals({
      finalUrl: "https://example.com/",
      contentType: "text/html",
      headers: {
        "content-type": "text/html",
        "content-security-policy":
          "default-src 'self'; script-src 'self' https://js.stripe.com",
      },
      body: FIXTURE_HTML.nextjs,
      passoffScriptHost: "127.0.0.1",
    });

    const guided = applyCspGuidanceToResult(
      buildResultFromTemplate({
        platform: "nextjs",
        confidence: "high",
        evidence: ["Next.js markers were present."],
        cautions: [],
      }),
      evidence,
    );

    expect(guided.steps[0]).toMatch(
      /Update your website’s content security policy.*127\.0\.0\.1/i,
    );
    expect(guided.cautions[0]).toMatch(/does not allow scripts from 127\.0\.0\.1/i);
  });
});
