import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { SectionIntro } from "@/components/section-intro";

describe("SectionIntro", () => {
  it("places the heading and supporting copy in a shared layout", () => {
    render(
      <SectionIntro kicker="How we compare" titleId="method-heading" title="Fair first. Useful always.">
        Start with the tool already on your shortlist.
      </SectionIntro>,
    );

    expect(screen.getByRole("heading", { level: 2, name: "Fair first. Useful always." })).toHaveAttribute(
      "id",
      "method-heading",
    );
    expect(screen.getByText("Start with the tool already on your shortlist.")).toBeVisible();
    expect(screen.getByText("How we compare")).toBeVisible();
  });
});
