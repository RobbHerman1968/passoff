import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

import {
  DEMO_SCREENSHOT_SPECS,
  generateDemoScreenshotPng,
  readPngDimensions,
} from "../scripts/demo-screenshots.mjs";

describe("demo screenshot fixtures", () => {
  it("generates PNGs whose IHDR dimensions match recorded width/height", () => {
    expect(DEMO_SCREENSHOT_SPECS.length).toBeGreaterThanOrEqual(3);
    for (const spec of DEMO_SCREENSHOT_SPECS) {
      const { bytes, width, height } = generateDemoScreenshotPng(spec);
      expect(width).toBe(spec.width);
      expect(height).toBe(spec.height);
      const dims = readPngDimensions(bytes);
      expect(dims).toEqual({ width: spec.width, height: spec.height });
      // Realistic size: larger than a 1×1 stub, still bounded for local seed.
      expect(bytes.byteLength).toBeGreaterThan(800);
      expect(bytes.byteLength).toBeLessThan(400_000);
    }
  });

  it("produces visibly distinct revision layouts (different bytes)", () => {
    const hero = generateDemoScreenshotPng(DEMO_SCREENSHOT_SPECS.find((s) => s.id === "rev2-hero")!);
    const mobile = generateDemoScreenshotPng(
      DEMO_SCREENSHOT_SPECS.find((s) => s.id === "rev2-mobile")!,
    );
    const contact = generateDemoScreenshotPng(
      DEMO_SCREENSHOT_SPECS.find((s) => s.id === "rev2-contact")!,
    );
    expect(hero.bytes.equals(mobile.bytes)).toBe(false);
    expect(hero.bytes.equals(contact.bytes)).toBe(false);
    expect(mobile.width).toBe(390);
    expect(mobile.height).toBe(844);
  });
});

describe("demo seed script guards", () => {
  const scriptPath = path.join(process.cwd(), "scripts", "seed-demo.mjs");
  const source = readFileSync(scriptPath, "utf8");

  it("refuses production without an explicit safe override", () => {
    expect(source).toMatch(/PASSOFF_ALLOW_DEMO_SEED/);
    expect(source).toMatch(/Refusing demo seed in production/);
    expect(source).toMatch(/isProdLike && !allowOverride/);
  });

  it("refuses local asset paths in remote databases without Blob or override", () => {
    expect(source).toMatch(/PASSOFF_ALLOW_REMOTE_LOCAL_ASSETS/);
    expect(source).toMatch(/BLOB_READ_WRITE_TOKEN/);
    expect(source).toMatch(/CONFIRM_DEMO_RESEED/);
  });

  it("uses generated demo screenshots rather than 1×1 stubs", () => {
    expect(source).toMatch(/generateDemoScreenshotPng/);
    expect(source).toMatch(/demo-screenshots\.mjs/);
    expect(source).not.toMatch(/tinyPng/);
  });

  it("seeds approval, handoff release, and share link artifacts", () => {
    expect(source).toMatch(/revision\.approved/);
    expect(source).toMatch(/handoff\.released/);
    expect(source).toMatch(/share_links/);
    expect(source).toMatch(/clientShareUrl/);
  });
});
