/** Minimum length rejects trivially short secrets while allowing passphrases. */
export const PASSWORD_MIN_LENGTH = 10;

/**
 * Documented maximum. Passwords are never silently truncated.
 * Argon2id handles long passphrases; this bound prevents abuse of hashing cost.
 */
export const PASSWORD_MAX_LENGTH = 200;

export const PASSWORD_POLICY_HINT = `At least ${PASSWORD_MIN_LENGTH} characters, up to ${PASSWORD_MAX_LENGTH}. Passphrases and password-manager passwords are welcome.`;

export function getPasswordRequirementCopy() {
  return `Use at least ${PASSWORD_MIN_LENGTH} characters. Longer passphrases and password-manager passwords work well. Maximum ${PASSWORD_MAX_LENGTH} characters.`;
}

export function validatePasswordPolicy(password: string): string | null {
  if (password.length < PASSWORD_MIN_LENGTH) {
    return `Enter a password with at least ${PASSWORD_MIN_LENGTH} characters.`;
  }

  if (password.length > PASSWORD_MAX_LENGTH) {
    return `Enter a password with at most ${PASSWORD_MAX_LENGTH} characters.`;
  }

  return null;
}
