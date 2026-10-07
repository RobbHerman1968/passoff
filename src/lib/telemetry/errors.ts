const BOT_UA =
  /bot|crawler|spider|crawling|preview|slurp|facebookexternalhit|whatsapp|telegram|discordbot|lighthouse|pagespeed|headlesschrome|phantomjs|selenium|webdriver|cypress|playwright|puppeteer|pingdom|uptimerobot|statuscake|newrelicpinger|synthetics/i;

export function isLikelyBotUserAgent(userAgent: string | null | undefined): boolean {
  if (!userAgent) return false;
  return BOT_UA.test(userAgent);
}

export const ERROR_CATEGORIES = [
  "type_error",
  "reference_error",
  "syntax_error",
  "range_error",
  "uri_error",
  "network_error",
  "script_error",
  "unknown_error",
] as const;

export type ErrorCategory = (typeof ERROR_CATEGORIES)[number];

const SECRETISH =
  /(?:password|passwd|secret|token|bearer|authorization|cookie|session|api[_-]?key|ssn|card|cvv)/i;
const QUERY = /\?[^#\s]+/g;
const EMAIL = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi;
const UUID =
  /[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/gi;

export function categorizeErrorName(name: string | undefined): ErrorCategory {
  const value = (name ?? "").toLowerCase();
  if (value.includes("type")) return "type_error";
  if (value.includes("reference")) return "reference_error";
  if (value.includes("syntax")) return "syntax_error";
  if (value.includes("range")) return "range_error";
  if (value.includes("uri")) return "uri_error";
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

export function errorFingerprint(
  category: ErrorCategory,
  sanitizedStable: string,
): string {
  return `${category}:${sanitizedStable}`.slice(0, 120);
}

export function looksLikePersonalErrorText(text: string): boolean {
  return EMAIL.test(text) || SECRETISH.test(text) || /@/.test(text);
}
