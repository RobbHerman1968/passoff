import { readdirSync } from "node:fs";
import path from "node:path";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";

/**
 * Apply pending drizzle-postgres migrations in journal order.
 * Uses the official drizzle migrator so a fresh test database receives 0000–0009.
 */
export async function ensureTestMigrations() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required to apply test migrations.");
  }

  const migrationsFolder = path.join(process.cwd(), "drizzle-postgres");
  const files = readdirSync(migrationsFolder).filter((f) => f.endsWith(".sql"));
  if (!files.includes("0007_first_release_hardening.sql")) {
    throw new Error(
      "Missing drizzle-postgres/0007_first_release_hardening.sql — migration discovery is misconfigured (drizzle.config out dir must be drizzle-postgres).",
    );
  }
  if (!files.includes("0008_reviewer_session_identity.sql")) {
    throw new Error(
      "Missing drizzle-postgres/0008_reviewer_session_identity.sql — reviewer session-identity migration is required.",
    );
  }
  if (!files.includes("0009_handoff_item_asset_unique.sql")) {
    throw new Error(
      "Missing drizzle-postgres/0009_handoff_item_asset_unique.sql — handoff asset uniqueness migration is required.",
    );
  }

  const pool = new pg.Pool({ connectionString: databaseUrl });
  try {
    const db = drizzle(pool);
    await migrate(db, { migrationsFolder });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const cause =
      error instanceof Error && error.cause instanceof Error ? error.cause.message : "";
    const combined = `${message}\n${cause}`;
    if (/ENOTFOUND|ECONNREFUSED|fetch failed|getaddrinfo|connection/i.test(combined)) {
      throw new Error(
        `Unable to reach DATABASE_URL for migrations (${cause || message}). ` +
          "Apply drizzle-postgres migrations with `npm run db:migrate` when the database is reachable. " +
          "Tenant-isolation and release-hardening DB tests require a live Postgres with 0007 applied.",
      );
    }
    throw error;
  } finally {
    await pool.end();
  }
}
