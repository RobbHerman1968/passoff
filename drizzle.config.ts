import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

// Prefer project env files over a stale shell DATABASE_URL (e.g. localhost).
config({ path: ".env.local", override: true });
config({ path: ".env", override: true });

// `PASSOFF_DB_TARGET=test npm run db:migrate` migrates the disposable test database.
// Without it, Drizzle Kit only ever touches DATABASE_URL.
const targetsTestDatabase = process.env.PASSOFF_DB_TARGET === "test";
if (targetsTestDatabase) {
  config({ path: ".env.test.local", override: true });
}

const databaseUrl = targetsTestDatabase
  ? process.env.TEST_DATABASE_URL
  : process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error(
    targetsTestDatabase
      ? "TEST_DATABASE_URL is required to migrate the test database."
      : "DATABASE_URL is required to run Drizzle Kit.",
  );
}

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: databaseUrl,
  },
  strict: true,
  verbose: true,
});
