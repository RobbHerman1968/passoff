-- Defense in depth: at most one handoff item may reference a given asset.
-- PostgreSQL unique indexes allow multiple NULLs, so note/link rows stay valid.
-- Fail loudly if existing non-null asset references are duplicated. Silently
-- accepting that state would mark this migration applied without the invariant.
CREATE UNIQUE INDEX IF NOT EXISTS "handoff_items_asset_id_unique"
  ON "handoff_items" ("asset_id");
