import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
}));

vi.mock("@/lib/auth/platform-admin", () => ({
  requirePlatformAdmin: vi.fn(),
}));

import { redirect } from "next/navigation";
import AdminPage from "@/app/(app)/admin/page";
import { requirePlatformAdmin } from "@/lib/auth/platform-admin";

const mockedRequire = vi.mocked(requirePlatformAdmin);
const mockedRedirect = vi.mocked(redirect);

describe("AdminPage", () => {
  beforeEach(() => {
    mockedRequire.mockReset();
    mockedRedirect.mockClear();
  });

  it("redirects unauthenticated visitors to sign-in with a safe callback", async () => {
    mockedRequire.mockResolvedValue({ ok: false, reason: "unauthenticated" });

    await expect(AdminPage()).rejects.toThrow("REDIRECT:/sign-in?callbackUrl=/admin");
  });

  it("shows a friendly denial for ordinary users", async () => {
    mockedRequire.mockResolvedValue({ ok: false, reason: "forbidden" });

    const ui = await AdminPage();
    render(ui);

    expect(
      screen.getByRole("heading", { name: "You don't have access to this area" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Go to projects" })).toHaveAttribute(
      "href",
      "/dashboard",
    );
    expect(screen.queryByText(/status code|SQL|DATABASE|stack/i)).not.toBeInTheDocument();
  });

  it("shows the administrator area for platform admins", async () => {
    mockedRequire.mockResolvedValue({
      ok: true,
      admin: {
        userId: "admin-1",
        email: "admin@example.com",
        name: "Ada Admin",
        platformRole: "admin",
      },
    });

    const ui = await AdminPage();
    render(ui);

    expect(
      screen.getByRole("heading", { name: "Passoff administration", level: 1 }),
    ).toBeInTheDocument();
    expect(screen.getByText("Ada Admin")).toBeInTheDocument();
    expect(
      screen.getByText(/This administrator area is restricted/i),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to projects" })).toHaveAttribute(
      "href",
      "/dashboard",
    );
  });
});
