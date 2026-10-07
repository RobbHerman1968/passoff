import { describe, expect, it } from "vitest";

import {
  clamp01,
  clientPointToNormalized,
  containedContentRect,
  nudgeNormalized,
  normalizedToPoint,
  pointToNormalized,
  rectsEqual,
} from "@/lib/video/annotations/geometry";

describe("containedContentRect", () => {
  it("fills the box when the shapes match", () => {
    expect(containedContentRect({ width: 800, height: 450 }, { width: 1920, height: 1080 })).toEqual({
      left: 0,
      top: 0,
      width: 800,
      height: 450,
    });
  });

  it("centers a wide picture with bars above and below (letterbox)", () => {
    const rect = containedContentRect({ width: 800, height: 600 }, { width: 1600, height: 900 });
    expect(rect).toEqual({ left: 0, top: 75, width: 800, height: 450 });
  });

  it("centers a tall picture with bars on the sides (pillarbox)", () => {
    const rect = containedContentRect({ width: 800, height: 450 }, { width: 900, height: 1600 });
    expect(rect?.top).toBe(0);
    expect(rect?.height).toBe(450);
    expect(rect?.width).toBeCloseTo(253.125, 3);
    expect(rect?.left).toBeCloseTo((800 - 253.125) / 2, 3);
  });

  it("returns null until both sizes are known", () => {
    expect(containedContentRect({ width: 0, height: 100 }, { width: 10, height: 10 })).toBeNull();
    expect(containedContentRect({ width: 100, height: 100 }, { width: 0, height: 0 })).toBeNull();
    expect(containedContentRect({ width: NaN, height: 100 }, { width: 10, height: 10 })).toBeNull();
  });
});

describe("pointToNormalized", () => {
  const content = { left: 0, top: 75, width: 800, height: 450 };

  it("maps corners and the center", () => {
    expect(pointToNormalized({ x: 0, y: 75 }, content)).toEqual({ x: 0, y: 0 });
    expect(pointToNormalized({ x: 800, y: 525 }, content)).toEqual({ x: 1, y: 1 });
    expect(pointToNormalized({ x: 400, y: 300 }, content)).toEqual({ x: 0.5, y: 0.5 });
  });

  it("rejects a point in the black bars", () => {
    expect(pointToNormalized({ x: 400, y: 20 }, content)).toBeNull();
    expect(pointToNormalized({ x: 400, y: 560 }, content)).toBeNull();
  });

  it("snaps a point in the bars to the nearest edge when asked", () => {
    expect(pointToNormalized({ x: 400, y: 20 }, content, { clampToEdge: true })).toEqual({
      x: 0.5,
      y: 0,
    });
    expect(pointToNormalized({ x: 900, y: 600 }, content, { clampToEdge: true })).toEqual({
      x: 1,
      y: 1,
    });
  });

  it("round-trips through normalizedToPoint", () => {
    const normalized = { x: 0.25, y: 0.8 };
    const point = normalizedToPoint(normalized, content);
    const back = pointToNormalized(point, content);
    expect(back?.x).toBeCloseTo(0.25, 6);
    expect(back?.y).toBeCloseTo(0.8, 6);
  });
});

describe("clientPointToNormalized", () => {
  const video = { width: 1600, height: 900 };

  it("accounts for where the player sits on the page", () => {
    const box = { left: 100, top: 200, width: 800, height: 600 };
    // Picture occupies y 275..725 on the page.
    expect(clientPointToNormalized({ x: 500, y: 500 }, box, video)).toEqual({ x: 0.5, y: 0.5 });
    expect(clientPointToNormalized({ x: 500, y: 220 }, box, video)).toBeNull();
  });

  it("gives the same answer in full screen on a different aspect ratio", () => {
    const fullscreen = { left: 0, top: 0, width: 1920, height: 1200 };
    // Picture is 1920x1080 centered; its center is the screen center.
    const point = clientPointToNormalized({ x: 960, y: 600 }, fullscreen, video);
    expect(point?.x).toBeCloseTo(0.5, 6);
    expect(point?.y).toBeCloseTo(0.5, 6);
  });

  it("is unchanged by page zoom or screen sharpness, because the box and pointer scale together", () => {
    const base = { left: 10, top: 20, width: 640, height: 360 };
    const zoomed = { left: 20, top: 40, width: 1280, height: 720 };
    const a = clientPointToNormalized({ x: 330, y: 200 }, base, video);
    const b = clientPointToNormalized({ x: 660, y: 400 }, zoomed, video);
    expect(a?.x).toBeCloseTo(b?.x ?? NaN, 6);
    expect(a?.y).toBeCloseTo(b?.y ?? NaN, 6);
  });

  it("returns null when the video size is not known yet", () => {
    expect(
      clientPointToNormalized({ x: 1, y: 1 }, { left: 0, top: 0, width: 100, height: 100 }, {
        width: 0,
        height: 0,
      }),
    ).toBeNull();
  });
});

describe("helpers", () => {
  it("clamps to 0..1 and treats non-numbers as 0", () => {
    expect(clamp01(-1)).toBe(0);
    expect(clamp01(2)).toBe(1);
    expect(clamp01(0.4)).toBe(0.4);
    expect(clamp01(NaN)).toBe(0);
  });

  it("compares rectangles with a small tolerance", () => {
    const a = { left: 0, top: 0, width: 100, height: 50 };
    expect(rectsEqual(a, { ...a, width: 100.3 })).toBe(true);
    expect(rectsEqual(a, { ...a, width: 102 })).toBe(false);
    expect(rectsEqual(a, null)).toBe(false);
    expect(rectsEqual(null, null)).toBe(true);
  });

  it("nudges a pin with the keyboard and stops at the edges", () => {
    expect(nudgeNormalized({ x: 0.5, y: 0.5 }, "ArrowRight", false)).toEqual({ x: 0.51, y: 0.5 });
    const big = nudgeNormalized({ x: 0.5, y: 0.5 }, "ArrowUp", true);
    expect(big?.y).toBeCloseTo(0.4, 6);
    expect(nudgeNormalized({ x: 0.995, y: 0.5 }, "ArrowRight", false)).toEqual({ x: 1, y: 0.5 });
    expect(nudgeNormalized({ x: 0.5, y: 0.5 }, "Home", false)).toEqual({ x: 0, y: 0.5 });
    expect(nudgeNormalized({ x: 0.5, y: 0.5 }, "End", false)).toEqual({ x: 1, y: 0.5 });
    expect(nudgeNormalized({ x: 0.5, y: 0.5 }, "a", false)).toBeNull();
  });
});
