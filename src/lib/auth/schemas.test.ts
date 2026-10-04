import { describe, expect, it } from "vitest";

import { signUpSchema } from "@/lib/auth/schemas";

describe("signUpSchema", () => {
  it("validates signup fields and password mismatch", () => {
    const mismatch = signUpSchema.safeParse({
      firstName: "Ada",
      lastName: "Lovelace",
      email: "ada@example.com",
      password: "long-enough-password",
      confirmPassword: "different-password",
    });
    expect(mismatch.success).toBe(false);

    const ok = signUpSchema.safeParse({
      firstName: "Ada",
      lastName: "Lovelace",
      email: "  Ada@Example.com ",
      password: "long-enough-password",
      confirmPassword: "long-enough-password",
    });
    expect(ok.success).toBe(true);
    if (ok.success) {
      expect(ok.data.email).toBe("ada@example.com");
      expect(ok.data.firstName).toBe("Ada");
      expect(ok.data.lastName).toBe("Lovelace");
    }
  });
});
