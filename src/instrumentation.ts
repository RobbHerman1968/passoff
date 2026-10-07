import type { Instrumentation } from "next";

/**
 * Runs once when a server instance starts. In production it writes one privacy-safe line
 * naming any missing or unsafe settings, so a bad deployment is visible in the logs before
 * a customer finds it. It never throws: a configuration gap must not take the site down.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.NODE_ENV !== "production") return;
  const { evaluateReadiness } = await import("@/lib/ops/readiness");
  const { logOps } = await import("@/lib/ops/diagnostics");
  const checks = evaluateReadiness(process.env).filter((check) => check.level !== "ok");
  if (checks.length === 0) {
    logOps("info", "config.ready");
    return;
  }
  for (const check of checks) {
    logOps(check.level === "problem" ? "error" : "warn", "config.check", {
      check: check.id,
      severity: check.level,
    });
  }
}

/**
 * Server errors, reported by route template and error class only. The request path
 * template (for example /projects/[projectId]) is logged, never the real URL, so ids and
 * secret link tokens never reach the logs.
 */
export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
  const { logOps, safeErrorSummary } = await import("@/lib/ops/diagnostics");
  const digest =
    typeof error === "object" && error !== null && "digest" in error
      ? String((error as { digest: unknown }).digest)
      : undefined;
  logOps("error", "request.failed", {
    route: context.routePath,
    routeType: context.routeType,
    method: request.method,
    digest,
    ...safeErrorSummary(error),
  });
};
