/**
 * Normalize emails for lookup and uniqueness.
 * Trims whitespace and lowercases the full address for case-insensitive matching.
 */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
