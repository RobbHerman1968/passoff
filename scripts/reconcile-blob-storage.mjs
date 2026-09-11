/**
 * Inventory of Vercel Blob objects versus database references.
 *
 * Usage:
 *   npm run blob:reconcile
 *   npm run blob:reconcile -- --workspace=<workspace UUID> --grace-days=7
 *   npm run blob:reconcile -- --workspace=<workspace UUID> --grace-days=7 \
 *     --delete --confirm=DELETE_ORPHAN_BLOBS
 *
 * Dry-run is the default. Delete mode requires a workspace, a positive grace
 * period, and an exact confirmation phrase.
 */
import "dotenv/config";

import { createHash } from "node:crypto";
import { neon } from "@neondatabase/serverless";
import { del, list } from "@vercel/blob";

const args = process.argv.slice(2);

function option(name) {
  const prefix = `--${name}=`;
  return args.find((arg) => arg.startsWith(prefix))?.slice(prefix.length) ?? null;
}

if (args.some((arg) =>
  arg !== "--delete"
  && !arg.startsWith("--workspace=")
  && !arg.startsWith("--grace-days=")
  && !arg.startsWith("--confirm=")
)) {
  console.error(
    "Usage: npm run blob:reconcile -- [--workspace=<UUID>] [--grace-days=<number>] "
      + "[--delete --confirm=DELETE_ORPHAN_BLOBS]",
  );
  process.exit(1);
}

const databaseUrl = process.env.DATABASE_URL;
const blobToken = process.env.BLOB_READ_WRITE_TOKEN;
const workspaceFilter = option("workspace");
const graceDaysRaw = option("grace-days") ?? "7";
const graceDays = Number(graceDaysRaw);
const deleteMode = args.includes("--delete");
const confirmation = option("confirm");

if (!databaseUrl) {
  console.error("DATABASE_URL is required.");
  process.exit(1);
}
if (!blobToken) {
  console.error("BLOB_READ_WRITE_TOKEN is required.");
  process.exit(1);
}
if (workspaceFilter && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(workspaceFilter)) {
  console.error("--workspace must be a UUID.");
  process.exit(1);
}
if (!Number.isFinite(graceDays) || graceDays < 0) {
  console.error("--grace-days must be a non-negative number.");
  process.exit(1);
}
if (confirmation && !deleteMode) {
  console.error("--confirm is only valid with --delete.");
  process.exit(1);
}
if (deleteMode && (!workspaceFilter || graceDays <= 0 || confirmation !== "DELETE_ORPHAN_BLOBS")) {
  console.error(
    "Delete mode requires --workspace=<UUID>, --grace-days greater than zero, "
      + "and --confirm=DELETE_ORPHAN_BLOBS.",
  );
  process.exit(1);
}

const sql = neon(databaseUrl);
const cutoff = Date.now() - graceDays * 24 * 60 * 60 * 1000;

function safeSegment(value) {
  return createHash("sha256").update(value).digest("hex").slice(0, 32);
}

function mutablePreviewPath(workspaceId, projectId, fileKey, nodeId) {
  return `workspaces/${workspaceId}/figma/${projectId}/${safeSegment(fileKey)}/${safeSegment(nodeId)}.png`;
}

function versionPreviewPath(workspaceId, projectId, designId, versionId, nodeId) {
  return `workspaces/${workspaceId}/project-designs/${projectId}/${designId}/${versionId}/${safeSegment(nodeId)}.png`;
}

function matchesWorkspace(workspaceId) {
  return !workspaceFilter || workspaceId === workspaceFilter;
}

function family(pathname) {
  const segment = pathname.split("/")[2];
  if (segment === "figma") return "figma";
  if (segment === "project-designs") return "project-designs";
  if (segment === "projects") return "projects";
  if (segment === "developer-handoffs") return "developer-handoffs";
  if (segment === "rooms") return "rooms";
  return "other";
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes;
  let unit = -1;
  do {
    value /= 1024;
    unit += 1;
  } while (value >= 1024 && unit < units.length - 1);
  return `${value.toFixed(value >= 10 ? 1 : 2)} ${units[unit]}`;
}

function summarize(blobs) {
  return {
    count: blobs.length,
    bytes: blobs.reduce((total, blob) => total + blob.size, 0),
  };
}

function printSummary(label, blobs) {
  const summary = summarize(blobs);
  console.log(`${label.padEnd(34)} ${String(summary.count).padStart(8)}  ${formatBytes(summary.bytes).padStart(12)}`);
}

function printByFamily(title, blobs) {
  console.log(`\n${title}`);
  for (const name of ["rooms", "figma", "project-designs", "projects", "developer-handoffs", "other"]) {
    printSummary(name, blobs.filter((blob) => family(blob.pathname) === name));
  }
}

function printLargest(title, blobs) {
  if (!blobs.length) return;
  console.log(`\n${title} (maximum 25)`);
  for (const blob of [...blobs].sort((a, b) => b.size - a.size).slice(0, 25)) {
    console.log(
      `${formatBytes(blob.size).padStart(12)}  ${new Date(blob.uploadedAt).toISOString()}  ${blob.pathname}`,
    );
  }
}

async function listAllBlobs(prefix) {
  const blobs = [];
  let cursor;
  do {
    const page = await list({
      token: blobToken,
      prefix,
      cursor,
      limit: 1000,
    });
    blobs.push(...page.blobs);
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);
  return blobs;
}

console.log("Loading database references...");

async function loadDatabaseRows() {
  const [
    workspaceRows,
    assetRows,
    snapshotRows,
    previewRows,
    importRows,
    versionRows,
    deletionRows,
  ] = await Promise.all([
    sql`select id from workspaces`,
    sql`
      select workspace_id, object_key, upload_status, created_at
      from assets
      where object_key is not null
    `,
    sql`
      select snapshots.workspace_id, screens.object_key
      from developer_handoff_snapshot_screens screens
      inner join developer_handoff_snapshots snapshots on snapshots.id = screens.snapshot_id
    `,
    sql`
      select imports.workspace_id, imports.project_id, imports.figma_file_key,
             screens.figma_node_id, screens.image_url
      from figma_import_screens screens
      inner join figma_imports imports on imports.id = screens.figma_import_id
    `,
    sql`
      select workspace_id, project_id, figma_file_key, main_screen_id, thumbnail_url
      from figma_imports
    `,
    sql`
      select workspace_id, project_id, design_id, id, payload_json
      from project_design_versions
    `,
    sql`
      select workspace_id, object_key
      from blob_deletion_jobs
      where processed_at is null
    `,
  ]);
  return {
    workspaceRows,
    assetRows,
    snapshotRows,
    previewRows,
    importRows,
    versionRows,
    deletionRows,
  };
}

const databaseRows = await loadDatabaseRows();

if (workspaceFilter && !databaseRows.workspaceRows.some((row) => row.id === workspaceFilter)) {
  console.error(`Workspace ${workspaceFilter} was not found in this database.`);
  process.exit(1);
}

function addReference(references, pathname, source) {
  if (!pathname) return;
  const sources = references.get(pathname) ?? new Set();
  sources.add(source);
  references.set(pathname, sources);
}

function buildReferenceState(rows) {
  const references = new Map();
  const stalePendingAssets = new Set();
  const queuedForDeletion = new Set();
  const malformedVersions = [];
  const reference = (pathname, source) => addReference(references, pathname, source);

  for (const row of rows.assetRows) {
    if (!matchesWorkspace(row.workspace_id)) continue;
    if (row.upload_status === "orphaned") continue;
    reference(row.object_key, `asset:${row.upload_status}`);
    if (
      row.upload_status === "pending"
      && new Date(row.created_at).getTime() < Date.now() - 24 * 60 * 60 * 1000
    ) {
      stalePendingAssets.add(row.object_key);
    }
  }

  for (const row of rows.snapshotRows) {
    if (matchesWorkspace(row.workspace_id)) reference(row.object_key, "developer-handoff-snapshot");
  }

  for (const row of rows.previewRows) {
    if (!matchesWorkspace(row.workspace_id)) continue;
    if (row.image_url?.startsWith("/api/integrations/figma/previews?")) {
      reference(
        mutablePreviewPath(row.workspace_id, row.project_id, row.figma_file_key, row.figma_node_id),
        "figma-preview",
      );
    }
  }

  for (const row of rows.importRows) {
    if (!matchesWorkspace(row.workspace_id)) continue;
    if (row.thumbnail_url?.startsWith("/api/integrations/figma/previews?")) {
      reference(
        mutablePreviewPath(
          row.workspace_id,
          row.project_id,
          row.figma_file_key,
          row.main_screen_id || "__thumbnail__",
        ),
        "figma-thumbnail",
      );
    }
  }

  for (const row of rows.versionRows) {
    if (!matchesWorkspace(row.workspace_id)) continue;
    try {
      const payload = JSON.parse(row.payload_json);
      if (payload?.sourceType === "video") {
        if (typeof payload.video?.objectKey !== "string" || !payload.video.objectKey) {
          throw new Error("video objectKey is missing");
        }
        reference(payload.video.objectKey, "project-video");
        if (payload.video.poster !== null && payload.video.poster !== undefined) {
          if (typeof payload.video.poster.objectKey !== "string" || !payload.video.poster.objectKey) {
            throw new Error("video poster objectKey is missing");
          }
          reference(payload.video.poster.objectKey, "project-video-poster");
        }
        continue;
      }
      if (!Array.isArray(payload?.screens)) throw new Error("screens is not an array");
      for (const screen of payload.screens) {
        if (typeof screen?.preview?.nodeId !== "string") continue;
        reference(
          versionPreviewPath(
            row.workspace_id,
            row.project_id,
            row.design_id,
            row.id,
            screen.preview.nodeId,
          ),
          "design-version-preview",
        );
      }
    } catch (error) {
      malformedVersions.push({ id: row.id, error: error instanceof Error ? error.message : String(error) });
    }
  }

  for (const row of rows.deletionRows) {
    if (matchesWorkspace(row.workspace_id)) queuedForDeletion.add(row.object_key);
  }

  return { references, stalePendingAssets, queuedForDeletion, malformedVersions };
}

const {
  references,
  stalePendingAssets,
  queuedForDeletion,
  malformedVersions,
} = buildReferenceState(databaseRows);

const prefix = workspaceFilter ? `workspaces/${workspaceFilter}/` : "workspaces/";
console.log(`Listing Blob objects under ${prefix}...`);
const blobs = await listAllBlobs(prefix);

const referenced = [];
const queued = [];
const recentUnreferenced = [];
const orphanCandidates = [];

for (const blob of blobs) {
  if (references.has(blob.pathname)) {
    referenced.push(blob);
  } else if (queuedForDeletion.has(blob.pathname)) {
    queued.push(blob);
  } else if (new Date(blob.uploadedAt).getTime() > cutoff) {
    recentUnreferenced.push(blob);
  } else {
    orphanCandidates.push(blob);
  }
}

console.log(`\nBlob reconciliation (${deleteMode ? "delete enabled" : "read-only"})`);
console.log("Category                              Objects          Size");
console.log("----------------------------------------------------------------");
printSummary("Stored", blobs);
printSummary("Referenced by database", referenced);
printSummary("Queued for deletion", queued);
printSummary(`Unreferenced, newer than ${graceDays}d`, recentUnreferenced);
printSummary(`Orphan candidates, at least ${graceDays}d`, orphanCandidates);

printByFamily("Stored objects by family", blobs);

printByFamily(`Unreferenced objects newer than ${graceDays}d by family`, recentUnreferenced);
printLargest("Largest recent unreferenced objects", recentUnreferenced);

printByFamily(`Orphan candidates at least ${graceDays}d old by family`, orphanCandidates);
printLargest("Largest orphan candidates", orphanCandidates);

if (stalePendingAssets.size) {
  console.log(
    `\nWarning: ${stalePendingAssets.size} pending asset reference(s) are older than 24 hours. `
      + "They remain protected in this report until the orphan worker marks them orphaned.",
  );
}
if (malformedVersions.length) {
  console.log(
    `\nWarning: ${malformedVersions.length} design version payload(s) could not be parsed. `
      + "Their previews may appear as orphan candidates; do not delete until these rows are repaired.",
  );
  for (const row of malformedVersions.slice(0, 10)) {
    console.log(`  ${row.id}: ${row.error}`);
  }
}

if (!deleteMode) {
  console.log("\nNo blobs were deleted.");
} else if (malformedVersions.length) {
  console.error("\nDeletion aborted because one or more design version payloads could not be parsed.");
  process.exitCode = 1;
} else {
  console.log("\nRefreshing database references before deletion...");
  const refreshed = buildReferenceState(await loadDatabaseRows());
  if (refreshed.malformedVersions.length) {
    console.error("Deletion aborted because a design version became unreadable during the safety check.");
    process.exitCode = 1;
  } else {
    const confirmedCandidates = orphanCandidates.filter((blob) =>
      !refreshed.references.has(blob.pathname)
      && !refreshed.queuedForDeletion.has(blob.pathname)
    );
    const newlyProtected = orphanCandidates.length - confirmedCandidates.length;
    if (newlyProtected) {
      console.log(`Skipped ${newlyProtected} object(s) that gained a database reference or deletion job.`);
    }

    let deletedCount = 0;
    let deletedBytes = 0;
    const failures = [];
    for (const blob of confirmedCandidates) {
      try {
        await del(blob.pathname, { token: blobToken, ifMatch: blob.etag });
        deletedCount += 1;
        deletedBytes += blob.size;
      } catch (error) {
        failures.push({
          pathname: blob.pathname,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    console.log(`Deleted ${deletedCount} object(s), reclaiming ${formatBytes(deletedBytes)}.`);
    if (failures.length) {
      console.error(`${failures.length} deletion(s) failed:`);
      for (const failure of failures.slice(0, 25)) {
        console.error(`  ${failure.pathname}: ${failure.error}`);
      }
      process.exitCode = 1;
    }
  }
}
