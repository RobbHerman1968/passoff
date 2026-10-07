const SECRETISH =
  /(?:password|passwd|secret|token|bearer|authorization|cookie|session|api[_-]?key)/i;
const QUERY = /\?[^#\s]+/g;
const EMAIL = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi;
const UUID =
  /[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/gi;

export function categorizeErrorName(name: string | undefined): string {
  const value = (name ?? "").toLowerCase();
  if (value.includes("type")) return "type_error";
  if (value.includes("reference")) return "reference_error";
  if (value.includes("syntax")) return "syntax_error";
  if (value.includes("range")) return "range_error";
  if (value.includes("network") || value.includes("fetch")) return "network_error";
  if (value.includes("script")) return "script_error";
  return "unknown_error";
}

export function sanitizeErrorMessage(message: string): string {
  return message
    .replace(QUERY, "")
    .replace(EMAIL, "[redacted]")
    .replace(UUID, "[id]")
    .replace(SECRETISH, "[redacted]")
    .slice(0, 80);
}

export function errorFingerprint(category: string, sanitized: string): string {
  return `${category}:${sanitized}`.slice(0, 120);
}
