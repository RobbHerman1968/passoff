import {
  DEFAULT_SENSITIVE_ROUTE_PATTERNS,
  ROUTE_MAX,
} from "@/lib/telemetry/contract";

const EMAIL_IN_PATH = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i;
const TOKENISH = /(?:token|session|jwt|key|secret|auth)=/i;
const UUID =
  /[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/gi;
const LONG_NUMERIC_ID = /\/\d{6,}(?=\/|$)/g;

export function stripQueryAndFragment(raw: string): URL | null {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return null;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
  if (parsed.username || parsed.password) return null;
  parsed.search = "";
  parsed.hash = "";
  return parsed;
}

export function normalizeTelemetryRoute(
  pathname: string,
  routeTemplate?: string,
): string {
  const template = routeTemplate?.trim();
  if (template && template.startsWith("/") && template.length <= ROUTE_MAX) {
    return template.slice(0, ROUTE_MAX);
  }
  let route = pathname.startsWith("/") ? pathname : `/${pathname}`;
  route = route.replace(EMAIL_IN_PATH, "/:redacted");
  route = route.replace(UUID, ":id");
  route = route.replace(LONG_NUMERIC_ID, "/:id");
  if (route.length > ROUTE_MAX) {
    route = route.slice(0, ROUTE_MAX);
  }
  return route || "/";
}

export function isSensitiveRoute(
  route: string,
  extraExclusions: string[] = [],
): boolean {
  const path = route.split("?")[0] ?? route;
  if (TOKENISH.test(path) || EMAIL_IN_PATH.test(path)) return true;
  if (DEFAULT_SENSITIVE_ROUTE_PATTERNS.some((pattern) => pattern.test(path))) {
    return true;
  }
  return extraExclusions.some((excluded) => {
    const value = excluded.trim();
    if (!value) return false;
    if (value.endsWith("*")) {
      return path.startsWith(value.slice(0, -1));
    }
    return path === value || path.startsWith(`${value}/`);
  });
}

export function normalizeExclusionList(values: string[]): string[] {
  const next: string[] = [];
  for (const value of values) {
    const trimmed = value.trim();
    if (!trimmed.startsWith("/") || trimmed.length > ROUTE_MAX) continue;
    if (!next.includes(trimmed)) next.push(trimmed);
  }
  return next.slice(0, 100);
}
