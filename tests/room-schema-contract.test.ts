import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

function sourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const absolute = path.join(directory, entry);
    if (statSync(absolute).isDirectory()) return sourceFiles(absolute);
    return /\.(?:ts|tsx)$/.test(entry) ? [absolute] : [];
  });
}

describe("room schema identity contract", () => {
  it("does not import the deprecated projects room alias in application code", () => {
    const offenders = sourceFiles(path.join(process.cwd(), "src")).filter((file) => {
      const source = readFileSync(file, "utf8");
      return /import\s*\{[^}]*\bprojects\b[^}]*\}\s*from\s*["']@\/db\/schema["']/s.test(source);
    });

    expect(offenders.map((file) => path.relative(process.cwd(), file))).toEqual([]);
  });
});
