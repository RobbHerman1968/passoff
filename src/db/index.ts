import "server-only";

import { attachDatabasePool } from "@vercel/functions";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import * as schema from "./schema";
import { resolveTestDatabaseUrl } from "./test-database-guard";

const isTestProcess = process.env.NODE_ENV === "test";

if (!isTestProcess && !process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required to connect to PostgreSQL.");
}

// Tests only ever open TEST_DATABASE_URL, and only after it is confirmed to be an
// isolated database that is not the one the app itself uses.
const databaseUrl = isTestProcess
  ? resolveTestDatabaseUrl(process.env)
  : (process.env.DATABASE_URL as string);

const parsedPoolSize = Number.parseInt(process.env.DATABASE_POOL_MAX ?? "10", 10);
const poolSize = Number.isFinite(parsedPoolSize) && parsedPoolSize > 0 ? parsedPoolSize : 10;

const globalDatabase = globalThis as unknown as {
  passoffPool?: Pool;
  passoffPoolAttached?: boolean;
};

// Reuse one bounded pool per process. This avoids a new connection for every request
// and prevents Next.js development reloads from leaking pools. Vercel's lifecycle
// hook closes idle connections before a Fluid Compute instance is suspended.
export const pool =
  globalDatabase.passoffPool ??
  new Pool({
    connectionString: databaseUrl,
    max: poolSize,
    min: 1,
    idleTimeoutMillis: 5_000,
    connectionTimeoutMillis: 10_000,
  });

if (!globalDatabase.passoffPoolAttached) {
  attachDatabasePool(pool);
  globalDatabase.passoffPoolAttached = true;
}

globalDatabase.passoffPool = pool;

export const db = drizzle({ client: pool, schema });
