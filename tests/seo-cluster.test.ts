import { describe, expect, it } from "vitest";

import { commercialPageList } from "../src/lib/seo/commercial";
import { getSeoPageInventory, SEO_PRIMARY_CTA } from "../src/lib/seo/inventory";
import { resourcePageList } from "../src/lib/seo/resources";

describe("SEO content cluster", () => {
  it("keeps distinct commercial intents and H1s", () => {
    const intents = commercialPageList.map((page) => page.primaryIntent);
    const h1s = commercialPageList.map((page) => page.h1);
    expect(new Set(intents).size).toBe(intents.length);
    expect(new Set(h1s).size).toBe(h1s.length);
    expect(commercialPageList).toHaveLength(5);
  });

  it("keeps resource pages linked to commercial pages", () => {
    const commercialPaths = new Set(commercialPageList.map((page) => page.path));
    for (const page of resourcePageList) {
      expect(commercialPaths.has(page.commercialLink.href)).toBe(true);
      expect(page.relatedResources).toHaveLength(2);
      expect(page.author.name.length).toBeGreaterThan(0);
      expect(page.publishedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it("exposes inventory for sitemap with primary CTA", () => {
    const inventory = getSeoPageInventory();
    expect(inventory.length).toBe(12);
    for (const page of inventory) {
      expect(page.primaryCta).toBe(SEO_PRIMARY_CTA.label);
      expect(page.url.startsWith("/")).toBe(true);
      expect(page.title.length).toBeGreaterThan(10);
      expect(page.description.length).toBeGreaterThan(40);
    }
  });

  it("does not advertise deferred features on commercial pages", () => {
    const banned = [/team seats/i, /custom domains/i, /white.?label/i, /AI contracts/i];
    for (const page of commercialPageList) {
      const blob = [
        page.heroLead,
        page.problemBody,
        page.revisionBody,
        page.workflowNote ?? "",
        ...page.faq.map((item) => item.answer),
      ].join(" ");
      // Mentions of deferred features are only allowed as explicit non-claims.
      if (/team seats|custom domains|white labeling/i.test(blob)) {
        expect(blob).toMatch(/not |deferred|coming later|do not|aren't|are not/i);
      }
      for (const pattern of banned) {
        if (pattern.test(blob) && !/not |deferred|coming later|do not/i.test(blob)) {
          throw new Error(`Unexpected deferred-feature claim on ${page.path}`);
        }
      }
    }
  });
});
