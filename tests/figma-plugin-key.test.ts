import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  generateProjectPluginKey,
  hashProjectPluginKey,
  verifyProjectPluginKey,
} from "@/lib/figma/plugin-key";

describe("project Figma plugin keys", () => {
  it("generates independent project credentials and stores verifiable hashes", () => {
    const projectAKey = generateProjectPluginKey();
    const projectBKey = generateProjectPluginKey();
    const projectAHash = hashProjectPluginKey(projectAKey);
    const projectBHash = hashProjectPluginKey(projectBKey);

    expect(projectAKey).toMatch(/^pofig_[A-Za-z0-9_-]{43}$/);
    expect(projectBKey).not.toBe(projectAKey);
    expect(projectAHash).toMatch(/^[0-9a-f]{64}$/);
    expect(verifyProjectPluginKey(projectAKey, projectAHash)).toBe(true);
    expect(verifyProjectPluginKey(projectAKey, projectBHash)).toBe(false);
    expect(verifyProjectPluginKey(projectBKey, projectAHash)).toBe(false);
    expect(verifyProjectPluginKey("invalid", projectAHash)).toBe(false);
  });

  it("offers one screen export behavior without nested scope controls", () => {
    const pluginRoot = path.join(process.cwd(), "figma-plugin");
    const code = readFileSync(path.join(pluginRoot, "code.js"), "utf8");
    const ui = readFileSync(path.join(pluginRoot, "ui.html"), "utf8");

    expect(code).not.toContain("collectDeep");
    expect(code).not.toContain("export-scope");
    expect(ui).not.toContain('name="scope"');
    expect(ui).not.toMatch(/High level/i);
    expect(ui).toContain("Export screens");
  });
});
