# Pass-Off Figma Exporter

This development-only plugin sends selected Figma frames to the local Pass-Off application without using Figma REST file or image quotas.

## Install

1. Run Pass-Off at `http://localhost:3000`.
2. Add `PASSOFF_FIGMA_PLUGIN_KEY` to the Pass-Off `.env` file and restart the app. Generate it with `openssl rand -hex 32`.
3. Open the Figma **desktop** app and a cloud design file (not a local `.fig` only).
4. Choose **Plugins → Development → Import plugin from manifest…** (or **re-import** after pulling plugin changes).
5. Select `figma-plugin/manifest.json` from this repository.
6. Optionally select frames, components, or sections (at most 1000). With nothing selected, the plugin uses the current page.
7. Run **Plugins → Development → Pass-Off Exporter**.
8. Choose **High level** or **All**, paste the Pass-Off **project key** (the UUID from `/projects/<id>` on the dashboard, or the project slug), paste the local plugin key, click **Export frames**, then open that project in Pass-Off. Uploads go in batches of 40.

**High level** exports only direct top-level frames/components/sections (or the current selection). **All** walks nested children and exports every matching node. The project key decides which Pass-Off project receives the import. The manifest sets `enablePrivatePluginApi` so development builds can read `figma.fileKey`; without a cloud file key the plugin falls back to a `local-…` id. If Figma requires an assigned plugin ID, create a new local plugin with **Custom UI** and copy its generated numeric ID into this manifest.

The ingestion route requires the local plugin key, restricts CORS to Figma plugin origins, and is disabled in production. A published plugin should use a signed Pass-Off user session and a fixed production domain.
