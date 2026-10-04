import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { SiteFooter } from "@/components/site-footer";

describe("SiteFooter", () => {
  it("keeps a compact set of product links without listing every comparison", () => {
    render(<SiteFooter />);

    expect(screen.getByRole("link", { name: "Passoff home" })).toBeVisible();
    expect(screen.getByRole("link", { name: "Website feedback" })).toBeVisible();
    expect(screen.getByRole("link", { name: "Video review" })).toBeVisible();
    expect(screen.getByRole("link", { name: "Client approval" })).toBeVisible();
    expect(screen.getByRole("link", { name: "Agencies" })).toBeVisible();
    expect(screen.getByRole("link", { name: "Pricing" })).toBeVisible();
    expect(screen.getByRole("link", { name: "Compare" })).toBeVisible();

    expect(screen.queryByRole("link", { name: "Passoff vs Pastel" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Passoff vs Marker.io" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Passoff vs Frame.io" })).not.toBeInTheDocument();
    expect(screen.getByText(/© \d{4} Passoff/)).toBeVisible();
  });
});
