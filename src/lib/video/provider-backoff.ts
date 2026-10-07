const BACKOFF_STEPS_MS = [
  60 * 1000,
  5 * 60 * 1000,
  15 * 60 * 1000,
  60 * 60 * 1000,
  3 * 60 * 60 * 1000,
  6 * 60 * 60 * 1000,
];

/** Waits longer after each failed try, up to six hours. Deletion is never abandoned. */
export function nextProviderDeleteBackoffMs(attempts: number): number {
  const index = Math.min(Math.max(attempts - 1, 0), BACKOFF_STEPS_MS.length - 1);
  return BACKOFF_STEPS_MS[index];
}
