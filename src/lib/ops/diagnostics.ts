/**
 * Privacy-safe operational logging.
 *
 * Support must be able to diagnose a failed install, upload, webhook, or scheduled job
 * without asking a customer for sensitive data, and without Passoff logs becoming a
 * second copy of customer data. So log lines carry only:
 *
 * - an event name,
 * - short scalar fields chosen by the caller (counts, durations, status codes, ids),
 * - the error's class name and database/system code, never its message.
 *
 * Error messages are left out on purpose: database and library messages can echo values
 * (emails, tokens, query text). Free text is passed through `scrub` as a second defence.
 */

const SAFE_KEY = /^[a-z][A-Za-z0-9_]{0,40}$/;
const MAX_VALUE_LENGTH = 120;

const SCRUBBERS: Array<[RegExp, string]> = [
  [/[\w.+-]+@[\w-]+\.[\w.-]+/g, "[email]"],
  [/\bBearer\s+\S+/gi, "Bearer [redacted]"],
  [/\b(?:sk|rk|pk|whsec|cus|sub|pi|evt|price)_[A-Za-z0-9_]{6,}/g, "[provider-id]"],
  [/\b[A-Za-z0-9_-]{32,}\b/g, "[token]"],
  [/([?&](?:token|code|key|secret|signature|sig)=)[^&\s]+/gi, "$1[redacted]"],
];

export function scrub(value: string): string {
  let out = value;
  for (const [pattern, replacement] of SCRUBBERS) out = out.replace(pattern, replacement);
  return out.length > MAX_VALUE_LENGTH ? `${out.slice(0, MAX_VALUE_LENGTH)}…` : out;
}

export function safeErrorSummary(error: unknown): { errorName: string; errorCode?: string } {
  if (error instanceof Error) {
    const code = (error as { code?: unknown }).code;
    return {
      errorName: error.name || "Error",
      ...(typeof code === "string" || typeof code === "number"
        ? { errorCode: scrub(String(code)) }
        : {}),
    };
  }
  return { errorName: "UnknownError" };
}

type Fields = Record<string, string | number | boolean | null | undefined>;

export function buildLogLine(
  level: "info" | "warn" | "error",
  event: string,
  fields: Fields = {},
  now = new Date(),
): string {
  const safe: Record<string, string | number | boolean | null> = {};
  for (const [key, raw] of Object.entries(fields)) {
    if (!SAFE_KEY.test(key) || raw === undefined) continue;
    if (typeof raw === "string") safe[key] = scrub(raw);
    else if (typeof raw === "number") safe[key] = Number.isFinite(raw) ? raw : null;
    else if (typeof raw === "boolean" || raw === null) safe[key] = raw;
    // Anything else (objects, arrays, functions) is dropped rather than serialized.
  }
  // Reserved keys always win, so a caller's field can never rewrite the line's own meaning.
  return JSON.stringify({ ...safe, ts: now.toISOString(), level, event: scrub(event) });
}

export function logOps(level: "info" | "warn" | "error", event: string, fields: Fields = {}) {
  const line = buildLogLine(level, event, fields);
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.info(line);
}
