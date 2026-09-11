# Pass-Off Figma Exporter

This development-only plugin sends selected Figma frames to the local Pass-Off application without using Figma REST file or image quotas.

## Install

1. Run Pass-Off at `http://localhost:3000`.
2. In the project’s **Add designs → Import from Figma → Local Figma plugin** flow, generate and copy that project’s plugin key.
3. Open the Figma **desktop** app and a cloud design file (not a local `.fig` only).
4. Choose **Plugins → Development → Import plugin from manifest…** (or **re-import** after pulling plugin changes).
5. Select `figma-plugin/manifest.json` from this repository.
6. Optionally select frames, components, or sections (at most 1000). With nothing selected, the plugin exports direct page-level items.
7. Run **Plugins → Development → Pass-Off Exporter**.
8. Paste the Pass-Off destination ID and project plugin key, then click **Export screens**. Uploads go in batches of 40.

The plugin exports selected frames/components/sections, or direct page-level items when nothing is selected. The destination ID decides which Pass-Off project receives the import. The manifest sets `enablePrivatePluginApi` so development builds can read `figma.fileKey`; without a cloud file key the plugin falls back to a `local-…` id. If Figma requires an assigned plugin ID, create a new local plugin with **Custom UI** and copy its generated numeric ID into this manifest.

Each project has an independent, rotatable plugin key. Pass-Off stores only its SHA-256 hash, so a generated or rotated plaintext key is shown once and should be pasted into Figma immediately. The ingestion route validates the key against the destination project, restricts CORS to Figma plugin origins, and is disabled in production. A published plugin should use a signed Pass-Off user session and a fixed production domain.
