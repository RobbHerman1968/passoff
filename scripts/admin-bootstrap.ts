/**
 * Explicit bootstrap only. Reads PASSOFF_BOOTSTRAP_ADMIN_EMAIL and grants
 * platform administrator access to that existing user.
 *
 * Never runs during app startup, signup, sign-in, or import.
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { config } from "dotenv";

config({ path: ".env.local" });
config({ path: ".env" });

const email = process.env.PASSOFF_BOOTSTRAP_ADMIN_EMAIL?.trim();
if (!email) {
  console.error(
    "Set PASSOFF_BOOTSTRAP_ADMIN_EMAIL to an existing user's email, then rerun.",
  );
  process.exit(1);
}

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const grantScript = path.join(scriptDir, "admin-grant.ts");
const result = spawnSync(
  process.execPath,
  ["--import", "tsx", grantScript, "--email", email],
  {
    stdio: "inherit",
    env: process.env,
  },
);

process.exit(result.status ?? 1);
