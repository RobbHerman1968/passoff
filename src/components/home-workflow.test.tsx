import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { HomeWorkflow } from "@/components/home-workflow";
import { HomeMediaModel } from "@/components/home-media-model";

describe("HomeWorkflow", () => {
  it("lets keyboard users move through the connected review", async () => {
    const user = userEvent.setup();
    render(<HomeWorkflow />);

    const first = screen.getByRole("tab", { name: /Share the work/i });
    expect(first).toHaveAttribute("aria-selected", "true");

    first.focus();
    await user.keyboard("{ArrowDown}");

    expect(screen.getByRole("tab", { name: /Resolve feedback in context/i })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(
      screen.getByRole("tabpanel", { name: /Resolve feedback in context/i }),
    ).toBeVisible();
  });
});

describe("HomeMediaModel", () => {
  it("switches between website and video without hiding either control", async () => {
    const user = userEvent.setup();
    render(<HomeMediaModel />);

    expect(screen.getByRole("tab", { name: "Website" })).toHaveAttribute("aria-selected", "true");
    await user.click(screen.getByRole("tab", { name: "Video" }));
    expect(screen.getByRole("tab", { name: "Video" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("link", { name: /Take a closer look/i })).toHaveAttribute(
      "href",
      "/video-review-software",
    );
  });
});
