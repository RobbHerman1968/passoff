const TITLE_MAX_LENGTH = 80;

/**
 * Derive a short display title from the first meaningful line of an issue body.
 * Does not persist a separate title column.
 */
export function deriveIssueDisplayTitle(
  body: string,
  maxLength = TITLE_MAX_LENGTH,
): string {
  const firstLine =
    body
      .split(/\r?\n/)
      .map((line) => line.replace(/\s+/g, " ").trim())
      .find((line) => line.length > 0) ?? "";

  if (!firstLine) {
    return "Untitled issue";
  }

  if (firstLine.length <= maxLength) {
    return firstLine;
  }

  const truncated = firstLine.slice(0, maxLength - 1).trimEnd();
  return `${truncated}…`;
}
