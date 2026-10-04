import { describe, expect, it } from "vitest";

import { hashPassword, verifyPassword } from "@/lib/auth/password";
import {
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  validatePasswordPolicy,
} from "@/lib/auth/password-policy";

describe("password policy", () => {
  it("rejects short passwords and overlong passwords without truncation", () => {
    expect(validatePasswordPolicy("a".repeat(PASSWORD_MIN_LENGTH - 1))).toMatch(
      /at least/i,
    );
    expect(validatePasswordPolicy("a".repeat(PASSWORD_MAX_LENGTH + 1))).toMatch(
      /at most/i,
    );
    expect(validatePasswordPolicy("a".repeat(PASSWORD_MIN_LENGTH))).toBeNull();
  });

  it("hashes and verifies with Argon2id", async () => {
    const password = "correct horse battery staple";
    const hash = await hashPassword(password);

    expect(hash).not.toContain(password);
    expect(hash.startsWith("$argon2")).toBe(true);
    await expect(verifyPassword(hash, password)).resolves.toBe(true);
    await expect(verifyPassword(hash, "wrong password!!")).resolves.toBe(false);
  });
});
