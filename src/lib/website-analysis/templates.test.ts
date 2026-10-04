import { describe, expect, it } from "vitest";

import {
  INSTALLATION_TEMPLATES,
  buildResultFromTemplate,
} from "@/lib/website-analysis/templates";
import { websiteAnalysisResultSchema } from "@/lib/website-analysis/schema";

describe("installation templates", () => {
  it("includes reviewed templates for supported platforms", () => {
    expect(Object.keys(INSTALLATION_TEMPLATES).sort()).toEqual(
      [
        "framer_custom_code",
        "generic_html_body",
        "gtm_custom_html",
        "manual_choice",
        "nextjs_script",
        "shopify_theme",
        "squarespace_code_injection",
        "webflow_custom_code",
        "wix_custom_code",
        "wordpress_header",
      ].sort(),
    );
  });

  it("never embeds executable install JavaScript in template steps", () => {
    for (const template of Object.values(INSTALLATION_TEMPLATES)) {
      const blob = JSON.stringify(template);
      expect(blob).not.toMatch(/<script/i);
      expect(blob).not.toMatch(/passoff\.js/i);
    }
  });

  it("builds schema-valid results from templates", () => {
    const result = buildResultFromTemplate({
      platform: "nextjs",
      confidence: "high",
      evidence: ["Next.js markers were present."],
    });
    expect(websiteAnalysisResultSchema.parse(result).recommendedMethod).toBe(
      "nextjs_script",
    );
  });
});
