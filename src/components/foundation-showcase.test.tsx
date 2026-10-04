import { render } from "@testing-library/react";
import { axe } from "jest-axe";
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { AppProviders } from "@/components/app-providers";
import { FoundationShowcase } from "@/components/foundation-showcase";
import { LoadingState } from "@/components/loading-state";

describe("foundation accessibility", () => {
  it("has no automated accessibility violations in the showcase", async () => {
    const { container } = render(
      <AppProviders>
        <FoundationShowcase />
      </AppProviders>,
    );

    const results = await axe(container, {
      rules: {
        "color-contrast": { enabled: false },
      },
    });

    expect(results).toHaveNoViolations();
  });

  it("does not require motion to understand loading state", () => {
    const { container } = render(<LoadingState />);
    const skeleton = container.querySelector('[data-slot="skeleton"]');
    expect(skeleton?.className).toContain("motion-reduce:animate-none");

    const css = readFileSync(
      resolve(process.cwd(), "src/app/globals.css"),
      "utf8",
    );
    expect(css).toContain("prefers-reduced-motion");
  });
});
