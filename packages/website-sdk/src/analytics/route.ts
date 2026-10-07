import { DEFAULT_SENSITIVE_ROUTE_PATTERNS, ROUTE_MAX } from "./contract";

const EMAIL_IN_PATH = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i;
const UUID =
  /[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/gi;
const LONG_NUMERIC_ID = /\/\d{6,}(?=\/|$)/g;

export function stripQueryAndFragment(raw: string): URL | null {
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    parsed.search = "";
    parsed.hash = "";
    return parsed;
  } catch {
    return null;
  }
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
  return (route || "/").slice(0, ROUTE_MAX);
}

export function isSensitiveRoute(route: string, extra: string[] = []): boolean {
  const path = route.split("?")[0] ?? route;
  if (DEFAULT_SENSITIVE_ROUTE_PATTERNS.some((pattern) => pattern.test(path))) {
    return true;
  }
  return extra.some((excluded) => {
    const value = excluded.trim();
    if (!value) return false;
    if (value.endsWith("*")) return path.startsWith(value.slice(0, -1));
    return path === value || path.startsWith(`${value}/`);
  });
}
