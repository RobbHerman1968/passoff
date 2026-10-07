import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "jest-axe";
import { describe, expect, it, vi } from "vitest";

import { RouteError } from "@/components/route-error";

describe("RouteError", () => {
  it("explains the problem in plain language without showing the underlying error", async () => {
    render(<RouteError digest="abc123" onRetry={() => {}} />);
    const heading = screen.getByRole("heading", { level: 1 });
    expect(heading).toHaveTextContent("We couldn’t load this page");
    expect(heading).toHaveFocus();
    expect(screen.getByText("abc123")).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/stack|TypeError|ECONN|SQL/i);
  });

  it("offers a retry and a way back", async () => {
    const onRetry = vi.fn();
    render(<RouteError onRetry={onRetry} homeHref="/dashboard" homeLabel="Go to your projects" />);
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("link", { name: "Go to your projects" })).toHaveAttribute(
      "href",
      "/dashboard",
    );
  });

  it("omits the reference when there is none", () => {
    render(<RouteError onRetry={() => {}} />);
    expect(screen.queryByText(/reference/i)).not.toBeInTheDocument();
  });

  it("has no detectable accessibility violations", async () => {
    const { container } = render(<RouteError digest="abc123" onRetry={() => {}} />);
    expect(await axe(container)).toHaveNoViolations();
  });
});
