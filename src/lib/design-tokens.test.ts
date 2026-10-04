import { describe, expect, it } from "vitest";

import { contrastRatio } from "@/lib/contrast";
import { DARK_THEME_PAIRS, LIGHT_THEME_PAIRS } from "@/lib/design-tokens";

describe("semantic token contrast", () => {
  it("meets WCAG 2.2 AA in the light theme", () => {
    for (const pair of LIGHT_THEME_PAIRS) {
      expect(
        contrastRatio(pair.foreground, pair.background),
        `${pair.usage} (${pair.id})`,
      ).toBeGreaterThanOrEqual(pair.minimum);
    }
  });

  it("meets WCAG 2.2 AA in the dark theme", () => {
    for (const pair of DARK_THEME_PAIRS) {
      expect(
        contrastRatio(pair.foreground, pair.background),
        `${pair.usage} (${pair.id})`,
      ).toBeGreaterThanOrEqual(pair.minimum);
    }
  });
});
