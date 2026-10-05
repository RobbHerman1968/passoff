import { readFileSync } from "node:fs";
import { join } from "node:path";

let cachedVersion: string | null = null;

function readBuildId(): string | null {
  try {
    const buildId = readFileSync(
      join(process.cwd(), ".next", "BUILD_ID"),
      "utf8",
    ).trim();
    return buildId || null;
  } catch {
    return null;
  }
}

/**
 * Stable identity for the running deployment. Clients poll this value and
 * reload when it changes after a new deploy.
 */
export function getAppVersion(): string {
  if (cachedVersion) {
    return cachedVersion;
  }

  const fromEnv =
    process.env.VERCEL_DEPLOYMENT_ID?.trim() ||
    process.env.VERCEL_GIT_COMMIT_SHA?.trim() ||
    process.env.PASSOFF_APP_VERSION?.trim();

  if (fromEnv) {
    cachedVersion = fromEnv;
    return cachedVersion;
  }

  cachedVersion = readBuildId() ?? (process.env.NODE_ENV === "production" ? "unknown" : "dev");
  return cachedVersion;
}

/** Test helper to clear the process-local cache. */
export function resetAppVersionCache(): void {
  cachedVersion = null;
}
