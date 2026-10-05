import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { LogoMark } from "@/components/logo";

describe("LogoMark", () => {
  it("uses the theme foreground for the right side of the mark", () => {
    const { container } = render(<LogoMark width={40} height={25} />);
    const mark = container.querySelector("svg");

    expect(mark).toHaveAttribute("aria-hidden", "true");
    expect(mark?.querySelectorAll('[fill="currentColor"]')).toHaveLength(3);
    expect(mark?.querySelectorAll('[stroke="currentColor"]')).toHaveLength(2);
  });
});
