import { config } from "dotenv";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import * as schema from "../src/db/schema";
import {
  grantPlatformAdmin,
  readEmailArgument,
} from "../src/lib/auth/platform-admin-provisioning";

config({ path: ".env.local" });
config({ path: ".env" });

async function main() {
  const email = readEmailArgument(process.argv.slice(2));
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required.");
  }

  const pool = new Pool({
    connectionString: databaseUrl,
    max: 1,
    idleTimeoutMillis: 5_000,
    connectionTimeoutMillis: 10_000,
  });
  const db = drizzle({ client: pool, schema });

  try {
    const result = await grantPlatformAdmin(db, email);
    if (!result.ok) {
      console.error(result.message);
      process.exitCode = 1;
      return;
    }

    if (!result.changed) {
      console.log(`Already a platform administrator: ${result.email}`);
      return;
    }

    console.log(`Granted platform administrator access to ${result.email}`);
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  const message =
    error instanceof Error ? error.message : "Administrator grant failed.";
  console.error(message);
  process.exitCode = 1;
});
