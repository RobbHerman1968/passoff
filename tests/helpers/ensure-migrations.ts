import { readdirSync } from "node:fs";
import path from "node:path";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";

/**
 * Apply pending drizzle-postgres migrations in journal order.
 * Uses the official drizzle migrator so a fresh test database receives all migrations.
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
  if (!files.includes("0010_figma_explanations.sql")) {
    throw new Error(
      "Missing drizzle-postgres/0010_figma_explanations.sql — design explanations require the forward-only 0010 migration.",
    );
  }
  if (!files.includes("0011_preserve_figma_explanations.sql")) {
    throw new Error(
      "Missing drizzle-postgres/0011_preserve_figma_explanations.sql — durable explanations must survive author removal.",
    );
  }
  if (!files.includes("0012_developer_handoff_snapshots.sql")) {
    throw new Error(
      "Missing drizzle-postgres/0012_developer_handoff_snapshots.sql — immutable developer handoff releases require migration 0012.",
    );
  }
  if (!files.includes("0013_project_room_hierarchy.sql")) {
    throw new Error(
      "Missing drizzle-postgres/0013_project_room_hierarchy.sql — projects and approval rooms require distinct ownership.",
    );
  }
  if (!files.includes("0014_project_design_versions.sql")) {
    throw new Error(
      "Missing drizzle-postgres/0014_project_design_versions.sql — immutable project design history requires migration 0014.",
    );
  }
  if (!files.includes("0015_project_figma_plugin_keys.sql")) {
    throw new Error(
      "Missing drizzle-postgres/0015_project_figma_plugin_keys.sql — project-bound Figma plugin credentials require migration 0015.",
    );
  }
  if (!files.includes("0016_project_design_trigger_fixes.sql")) {
    throw new Error(
      "Missing drizzle-postgres/0016_project_design_trigger_fixes.sql — versioned annotation triggers require the forward fix.",
    );
  }
  if (!files.includes("0017_published_explanation_author_cleanup.sql")) {
    throw new Error(
      "Missing drizzle-postgres/0017_published_explanation_author_cleanup.sql — immutable explanations must preserve deleted-author cleanup.",
    );
  }
  if (!files.includes("0018_project_design_version_tenant_normalization.sql")) {
    throw new Error(
      "Missing drizzle-postgres/0018_project_design_version_tenant_normalization.sql — design versions must inherit their design tenant.",
    );
  }
  if (!files.includes("0019_room_design_screen_comments.sql")) {
    throw new Error(
      "Missing drizzle-postgres/0019_room_design_screen_comments.sql — room review comments require immutable design-screen targets.",
    );
  }
  if (!files.includes("0020_versioned_video_review.sql")) {
    throw new Error(
      "Missing drizzle-postgres/0020_versioned_video_review.sql — immutable video review requires migration 0020.",
    );
  }
  if (!files.includes("0021_project_video_upload_sessions.sql")) {
    throw new Error(
      "Missing drizzle-postgres/0021_project_video_upload_sessions.sql — exact video upload completion requires migration 0021.",
    );
  }
  if (!files.includes("0022_video_version_trigger_hardening.sql")) {
    throw new Error(
      "Missing drizzle-postgres/0022_video_version_trigger_hardening.sql — trigger-owned video cleanup requires migration 0022.",
    );
  }
  if (!files.includes("0023_explanations_return_to_draft.sql")) {
    throw new Error(
      "Missing drizzle-postgres/0023_explanations_return_to_draft.sql — explanation authors must be able to return published guidance to draft.",
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
