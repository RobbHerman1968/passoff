import { describe, expect, it, vi } from "vitest";

import { buildScreenshotAnnotation } from "./screenshot-annotation";

function rect(
  left: number,
  top: number,
  width: number,
  height: number,
): DOMRect {
  return {
    x: left,
    y: top,
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
    toJSON() {},
  } as DOMRect;
}

function elementWithRect(
  tag: string,
  bounds: DOMRect,
  attributes: Record<string, string> = {},
): HTMLElement {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(attributes)) {
    el.setAttribute(key, value);
  }
  vi.spyOn(el, "getBoundingClientRect").mockReturnValue(bounds);
  return el;
}

describe("buildScreenshotAnnotation", () => {
  it("maps a selected child inside a larger contextual parent", () => {
    const parent = elementWithRect("section", rect(0, 0, 1000, 500));
    const child = elementWithRect("div", rect(100, 50, 200, 80));
    parent.append(child);
    document.body.append(parent);

    const annotation = buildScreenshotAnnotation(child, parent, {
      x: 0.25,
      y: 0.5,
    });

    expect(annotation).toEqual({
      version: 1,
      selectedBounds: { x: 0.1, y: 0.1, width: 0.2, height: 0.16 },
      pin: { x: 0.15, y: 0.18 },
    });
  });

  it("covers the full image when the selected element is the capture target", () => {
    const target = elementWithRect("section", rect(40, 20, 800, 400));
    document.body.append(target);

    const annotation = buildScreenshotAnnotation(target, target, {
      x: 0.5,
      y: 0.5,
    });

    expect(annotation?.selectedBounds).toEqual({
      x: 0,
      y: 0,
      width: 1,
      height: 1,
    });
    expect(annotation?.pin).toEqual({ x: 0.5, y: 0.5 });
  });

  it("clips selected bounds near each screenshot edge", () => {
    const parent = elementWithRect("section", rect(0, 0, 400, 300));
    const nearEdge = elementWithRect("div", rect(-20, -10, 60, 40));
    parent.append(nearEdge);

    const annotation = buildScreenshotAnnotation(nearEdge, parent, {
      x: 0,
      y: 0,
    });

    expect(annotation?.selectedBounds.x).toBe(0);
    expect(annotation?.selectedBounds.y).toBe(0);
    expect(annotation?.selectedBounds.width).toBeCloseTo(40 / 400);
    expect(annotation?.selectedBounds.height).toBeCloseTo(30 / 300);
    expect(annotation?.pin.x).toBe(0);
    expect(annotation?.pin.y).toBe(0);
  });

  it("supports a small selected element and an off-center click", () => {
    const parent = elementWithRect("section", rect(0, 0, 1000, 1000));
    const small = elementWithRect("span", rect(500, 500, 10, 8));
    parent.append(small);

    const annotation = buildScreenshotAnnotation(small, parent, {
      x: 0.9,
      y: 0.1,
    });

    expect(annotation?.selectedBounds.width).toBeCloseTo(0.01);
    expect(annotation?.selectedBounds.height).toBeCloseTo(0.008);
    expect(annotation?.pin.x).toBeCloseTo(0.509);
    expect(annotation?.pin.y).toBeCloseTo(0.5008);
  });

  it("uses viewport-relative geometry so page scroll cancels out", () => {
    const parent = elementWithRect("section", rect(0, 100, 600, 400));
    const child = elementWithRect("div", rect(120, 180, 100, 40));
    parent.append(child);

    const annotation = buildScreenshotAnnotation(child, parent, {
      x: 0.5,
      y: 0.5,
    });

    expect(annotation?.selectedBounds).toEqual({
      x: 0.2,
      y: 0.2,
      width: 100 / 600,
      height: 0.1,
    });
  });

  it("returns undefined for zero-sized targets and private selections", () => {
    const zero = elementWithRect("section", rect(0, 0, 0, 200));
    const child = elementWithRect("div", rect(10, 10, 20, 20));
    zero.append(child);
    expect(buildScreenshotAnnotation(child, zero)).toBeUndefined();

    const parent = elementWithRect("section", rect(0, 0, 400, 300));
    const privateEl = elementWithRect("div", rect(20, 20, 40, 40), {
      "data-passoff-private": "true",
    });
    parent.append(privateEl);
    expect(buildScreenshotAnnotation(privateEl, parent)).toBeUndefined();
  });
});
