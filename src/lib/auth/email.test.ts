import { describe, expect, it } from "vitest";

import { normalizeEmail } from "@/lib/auth/email";

describe("normalizeEmail", () => {
  it("trims and lowercases addresses", () => {
    expect(normalizeEmail("  Ada.Lovelace@Example.COM ")).toBe(
      "ada.lovelace@example.com",
    );
  });
});
