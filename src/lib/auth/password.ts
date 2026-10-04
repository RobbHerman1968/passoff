import "server-only";

import { hash, verify } from "@node-rs/argon2";

import {
  PASSWORD_MAX_LENGTH,
  validatePasswordPolicy,
} from "@/lib/auth/password-policy";

export {
  getPasswordRequirementCopy,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  PASSWORD_POLICY_HINT,
  validatePasswordPolicy,
} from "@/lib/auth/password-policy";

const ARGON2_OPTIONS = {
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
  outputLen: 32,
} as const;

export async function hashPassword(password: string): Promise<string> {
  const policyError = validatePasswordPolicy(password);
  if (policyError) {
    throw new Error("PASSWORD_POLICY");
  }

  return hash(password, ARGON2_OPTIONS);
}

export async function verifyPassword(
  passwordHash: string,
  password: string,
): Promise<boolean> {
  if (password.length === 0 || password.length > PASSWORD_MAX_LENGTH) {
    return false;
  }

  try {
    return await verify(passwordHash, password, ARGON2_OPTIONS);
  } catch {
    return false;
  }
}
