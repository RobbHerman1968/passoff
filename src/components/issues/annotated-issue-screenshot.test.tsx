import { act, render, screen } from "@testing-library/react";
import { axe } from "jest-axe";
import { beforeAll, describe, expect, it, vi } from "vitest";

import {
  AnnotatedIssueScreenshot,
  getContainedImageBox,
} from "@/components/issues/annotated-issue-screenshot";
import { IssueScreenshot } from "@/components/issues/issue-screenshot";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), replace: vi.fn(), push: vi.fn() }),
}));

beforeAll(() => {
  class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  vi.stubGlobal("ResizeObserver", ResizeObserverStub);
});

const annotation = {
  version: 1 as const,
  selectedBounds: { x: 0.1, y: 0.2, width: 0.3, height: 0.25 },
  pin: { x: 0.25, y: 0.3 },
};

describe("AnnotatedIssueScreenshot", () => {
  it("measures object-contain letterboxing for overlay placement", () => {
    const image = {
      clientWidth: 400,
      clientHeight: 200,
      naturalWidth: 100,
      naturalHeight: 100,
    } as HTMLImageElement;

    expect(getContainedImageBox(image)).toEqual({
      left: 100,
      top: 0,
      width: 200,
      height: 200,
    });
  });

  it("renders the outline and issue-number pin from normalized metadata", async () => {
    const { container } = render(
      <AnnotatedIssueScreenshot
        src="/api/projects/p1/reviews/r1/issues/12/screenshot"
        alt="Captured page context for issue 12. The selected area is marked."
        issueNumber={12}
        annotation={annotation}
      />,
    );

    const image = screen.getByRole("img", {
      name: "Captured page context for issue 12. The selected area is marked.",
    });
    Object.defineProperty(image, "naturalWidth", { value: 800, configurable: true });
    Object.defineProperty(image, "naturalHeight", { value: 600, configurable: true });
    Object.defineProperty(image, "clientWidth", { value: 400, configurable: true });
    Object.defineProperty(image, "clientHeight", { value: 300, configurable: true });
    await act(async () => {
      image.dispatchEvent(new Event("load"));
    });

    const overlay = container.querySelector("[data-screenshot-annotation]");
    expect(overlay).toBeTruthy();
    expect(overlay?.textContent).toBe("12");
    const outline = overlay?.querySelector("div");
    expect(outline).toHaveStyle({
      left: "10%",
      top: "20%",
      width: "30%",
      height: "25%",
    });
    expect(await axe(container)).toHaveNoViolations();
  });

  it("does not invent a pin when annotation metadata is missing", () => {
    const { container } = render(
      <IssueScreenshot
        projectId="p1"
        reviewId="r1"
        issueNumber={12}
        status="ready"
        captureMethod="browser_reconstruction"
        annotation={null}
      />,
    );

    expect(
      screen.getByText("The exact selected area was not recorded for this issue."),
    ).toBeVisible();
    expect(container.querySelector("[data-screenshot-annotation]")).toBeNull();
  });

  it("shows annotation copy and uses the same overlay in the full-size dialog", async () => {
    const { container } = render(
      <IssueScreenshot
        projectId="p1"
        reviewId="r1"
        issueNumber={7}
        status="ready"
        captureMethod="browser_reconstruction"
        annotation={annotation}
      />,
    );

    expect(
      screen.getByText(
        "The orange outline and numbered pin show what the reviewer selected.",
      ),
    ).toBeVisible();
    expect(
      screen.getByRole("img", {
        name: "Captured page context for issue 7. The selected area is marked.",
      }),
    ).toBeVisible();

    // Trigger overlay measurement for the main image.
    const image = screen.getByRole("img");
    Object.defineProperty(image, "naturalWidth", { value: 800, configurable: true });
    Object.defineProperty(image, "naturalHeight", { value: 600, configurable: true });
    Object.defineProperty(image, "clientWidth", { value: 400, configurable: true });
    Object.defineProperty(image, "clientHeight", { value: 300, configurable: true });
    await act(async () => {
      image.dispatchEvent(new Event("load"));
    });
    expect(
      container.querySelector("[data-screenshot-annotation]")?.textContent,
    ).toBe("7");
  });
});
