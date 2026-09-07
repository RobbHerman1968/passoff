/**
 * Production-safe structured logging.
 * Never log passwords, auth headers, cookies, raw share tokens, OAuth tokens,
 * API keys, Blob credentials, or file contents.
 */
type LogFields = Record<string, unknown>;

const REDACT_KEYS = /password|secret|token|authorization|cookie|api[_-]?key|credential|blob.*token|rawtoken|sharetoken/i;

function sanitize(fields?: LogFields): LogFields | undefined {
  if (!fields) return undefined;
  const out: LogFields = {};
  for (const [key, value] of Object.entries(fields)) {
    if (REDACT_KEYS.test(key)) {
      out[key] = "[redacted]";
    } else if (typeof value === "string" && value.length > 500) {
      out[key] = `${value.slice(0, 200)}…[truncated]`;
    } else {
      out[key] = value;
    }
  }
  return out;
}

function emit(level: "info" | "warn" | "error", event: string, fields?: LogFields) {
  const payload = {
    level,
    event,
    ts: new Date().toISOString(),
    ...sanitize(fields),
  };
  const line = JSON.stringify(payload);
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.info(line);
}

export function logInfo(event: string, fields?: LogFields) {
  emit("info", event, fields);
}

export function logWarn(event: string, fields?: LogFields) {
  emit("warn", event, fields);
}

export function logError(event: string, fields?: LogFields) {
  emit("error", event, fields);
}
