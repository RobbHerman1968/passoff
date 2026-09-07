/**
 * Idempotent fictional demo approval room for development/staging.
 *
 * Usage:
 *   npm run db:seed-owner   # ensure owner workspace exists
 *   npm run db:seed-demo
 *
 * Local-only by default when writing filesystem assets. With BLOB_READ_WRITE_TOKEN,
 * fixtures upload to Vercel Blob (safe for staging DBs). Refuses writing local
 * object paths into a remote database unless PASSOFF_ALLOW_REMOTE_LOCAL_ASSETS=1.
 *
 * Destructive reseed of an existing demo project requires CONFIRM_DEMO_RESEED=1
 * when the database host is not localhost.
 *
 * Refuses production unless PASSOFF_ALLOW_DEMO_SEED=1.
 * Prints owner room URL and client share URL.
 */
import "dotenv/config";
import { createHash, randomBytes } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { neon } from "@neondatabase/serverless";
import { put as blobPut } from "@vercel/blob";
import {
  DEMO_SCREENSHOT_SPECS,
  generateDemoScreenshotPng,
} from "./demo-screenshots.mjs";

const sql = neon(process.env.DATABASE_URL);

const nodeEnv = process.env.NODE_ENV || "development";
const vercelEnv = process.env.VERCEL_ENV || "";
const isProdLike = nodeEnv === "production" || vercelEnv === "production";
const allowOverride = process.env.PASSOFF_ALLOW_DEMO_SEED === "1";

if (isProdLike && !allowOverride) {
  console.error(
    "Refusing demo seed in production. Set PASSOFF_ALLOW_DEMO_SEED=1 only if you intentionally want a fictional demo room in this database.",
  );
  process.exit(1);
}

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is required.");
  process.exit(1);
}

const ownerEmail = process.env.PASSOFF_DEFAULT_USER_EMAIL || "owner@example.com";
const organizationSlug = process.env.PASSOFF_DEFAULT_ORGANIZATION_SLUG || "passoff";
const workspaceSlug = process.env.PASSOFF_DEFAULT_WORKSPACE_SLUG || "main";
const demoSlug = process.env.PASSOFF_DEMO_PROJECT_SLUG || "harbor-website-demo";
const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(/\/$/, "");
const assetRoot =
  process.env.PASSOFF_ROOM_ASSET_DIR || path.join(process.cwd(), ".data", "room-assets");
const blobToken = process.env.BLOB_READ_WRITE_TOKEN || "";
const useBlob = Boolean(blobToken);

function databaseHost() {
  try {
    return new URL(process.env.DATABASE_URL).hostname;
  } catch {
    return "";
  }
}

const dbHost = databaseHost();
const isLocalDb = /^(localhost|127\.0\.0\.1)$/i.test(dbHost);

if (!useBlob && !isLocalDb && process.env.PASSOFF_ALLOW_REMOTE_LOCAL_ASSETS !== "1") {
  console.error(
    `Refusing to write local filesystem asset paths into remote database host "${dbHost}".\n` +
      "Configure BLOB_READ_WRITE_TOKEN to upload fixtures to Blob, run against a local database,\n" +
      "or set PASSOFF_ALLOW_REMOTE_LOCAL_ASSETS=1 only if you understand the risk.",
  );
  process.exit(1);
}

const DEMO_PROJECT_NAME = "Harbor & Co. Website";
const DEMO_CLIENT_NAME = "Harbor & Co.";
const REVIEWER_NAME = "Alex Rivera";
const REVIEWER_EMAIL = "alex.rivera@example.com";
const APPROVAL_STATEMENT =
  "I approve this revision of the project as complete and ready for delivery. Further changes will require a new revision.";

function sha256Hex(input) {
  return createHash("sha256").update(input).digest("hex");
}

function computeRevisionDigest(members) {
  const canonical = [...members]
    .sort((a, b) => a.sortOrder - b.sortOrder || a.assetId.localeCompare(b.assetId))
    .map((m) => `${m.sortOrder}:${m.assetId}:${m.checksum || ""}`)
    .join("|");
  return sha256Hex(canonical);
}

function generateShareToken() {
  return randomBytes(32).toString("base64url");
}

/** Minimal PDF with a title line. */
function tinyPdf(title) {
  const content = `BT /F1 18 Tf 72 720 Td (${title.replace(/[()\\]/g, "")}) Tj ET`;
  const objects = [
    "1 0 obj<< /Type /Catalog /Pages 2 0 R >>endobj\n",
    "2 0 obj<< /Type /Pages /Kids [3 0 R] /Count 1 >>endobj\n",
    "3 0 obj<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources<< /Font<< /F1 5 0 R >> >> >>endobj\n",
    `4 0 obj<< /Length ${content.length} >>stream\n${content}\nendstream\nendobj\n`,
    "5 0 obj<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>endobj\n",
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  for (const obj of objects) {
    offsets.push(Buffer.byteLength(pdf, "utf8"));
    pdf += obj;
  }
  const xref = offsets.length;
  const xrefStart = Buffer.byteLength(pdf, "utf8");
  pdf += `xref\n0 ${xref}\n`;
  pdf += "0000000000 65535 f \n";
  for (let i = 1; i < offsets.length; i++) {
    pdf += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer<< /Size ${xref} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`;
  return Buffer.from(pdf, "utf8");
}

/** Minimal ZIP containing README.txt ("Harbor handoff package"). */
function tinyZip() {
  return Buffer.from(
    "UEsDBBQAAAAAAAAAAAAe/p+SFwAAABcAAAAKAAAAUkVBRE1FLnR4dEhhcmJvciBoYW5kb2ZmIHBhY2thZ2UKUEsBAhQAFAAAAAAAAAAAAB7+n5IXAAAAFwAAAAoAAAAAAAAAAAAAAAAAAAAAAFJFQURNRS50eHRQSwUGAAAAAAEAAQA4AAAAPwAAAAAA",
    "base64",
  );
}

async function writeFixture(objectKey, bytes, contentType) {
  if (useBlob) {
    const result = await blobPut(objectKey, bytes, {
      access: "private",
      token: blobToken,
      contentType,
      addRandomSuffix: false,
    });
    return { objectKey: result.pathname, blobUrl: result.url, storageProvider: "vercel_blob" };
  }
  const full = path.join(assetRoot, objectKey);
  await mkdir(path.dirname(full), { recursive: true });
  await writeFile(full, bytes);
  return { objectKey, blobUrl: null, storageProvider: "local" };
}

async function audit(workspaceId, projectId, actorType, actorId, action, targetType, targetId, metadata = {}) {
  await sql`
    insert into audit_events (
      workspace_id, project_id, actor_type, actor_id, action, target_type, target_id, metadata_json
    ) values (
      ${workspaceId}, ${projectId}, ${actorType}, ${actorId}, ${action}, ${targetType}, ${targetId},
      ${JSON.stringify(metadata)}
    )
  `;
}

async function wipeDemoProject(projectId) {
  const statements = [
    sql`delete from revision_assets where revision_id in (select id from revisions where project_id = ${projectId})`,
    sql`delete from approvals where project_id = ${projectId}`,
    sql`delete from room_comments where project_id = ${projectId}`,
    sql`delete from handoff_items where project_id = ${projectId}`,
    sql`delete from share_links where project_id = ${projectId}`,
    sql`delete from reviewers where project_id = ${projectId}`,
    sql`delete from assets where project_id = ${projectId}`,
    sql`delete from revisions where project_id = ${projectId}`,
    sql`delete from audit_events where project_id = ${projectId}`,
    sql`delete from projects where id = ${projectId}`,
  ];
  if (typeof sql.transaction === "function") {
    await sql.transaction(statements);
  } else {
    for (const statement of statements) await statement;
  }
}

const [user] = await sql`
  select id, email, name from users where email = ${ownerEmail} limit 1
`;
if (!user) {
  console.error(`Owner user ${ownerEmail} not found. Run npm run db:seed-owner first.`);
  process.exit(1);
}

const [organization] = await sql`
  select id, name, slug from organizations where slug = ${organizationSlug} limit 1
`;
if (!organization) {
  console.error(`Organization ${organizationSlug} not found. Run npm run db:seed-owner first.`);
  process.exit(1);
}

const [workspace] = await sql`
  select id, name, slug from workspaces
  where organization_id = ${organization.id} and slug = ${workspaceSlug}
  limit 1
`;
if (!workspace) {
  console.error(`Workspace ${workspaceSlug} not found. Run npm run db:seed-owner first.`);
  process.exit(1);
}

const existing = (
  await sql`
    select id from projects
    where workspace_id = ${workspace.id} and slug = ${demoSlug}
    limit 1
  `
)[0];

if (existing) {
  if (!isLocalDb && process.env.CONFIRM_DEMO_RESEED !== "1") {
    console.error(
      `Demo project "${demoSlug}" already exists on remote host "${dbHost}".\n` +
        "Re-run with CONFIRM_DEMO_RESEED=1 to wipe and recreate it.",
    );
    process.exit(1);
  }
  // Wipe prior demo children so re-seed is idempotent (approvals restrict delete order).
  await wipeDemoProject(existing.id);
}

const [project] = await sql`
  insert into projects (
    organization_id, workspace_id, name, client_name, slug, status
  ) values (
    ${organization.id}, ${workspace.id}, ${DEMO_PROJECT_NAME}, ${DEMO_CLIENT_NAME}, ${demoSlug}, 'DRAFT'
  )
  returning id, name, client_name, slug
`;

await audit(workspace.id, project.id, "user", user.id, "project.created", "project", project.id, {
  demo: true,
  name: DEMO_PROJECT_NAME,
});

const screenshotById = Object.fromEntries(
  DEMO_SCREENSHOT_SPECS.map((spec) => [spec.id, generateDemoScreenshotPng(spec)]),
);

async function insertImageAsset({ label, specId, objectKey }) {
  const shot = screenshotById[specId];
  if (!shot) throw new Error(`Missing demo screenshot ${specId}`);
  const checksum = sha256Hex(shot.bytes);
  const stored = await writeFixture(objectKey, shot.bytes, "image/png");
  const [asset] = await sql`
    insert into assets (
      workspace_id, project_id, kind, label, object_key, blob_url, storage_provider, upload_status,
      mime, bytes, width, height, checksum, uploaded_by_user_id
    ) values (
      ${workspace.id}, ${project.id}, 'image', ${label}, ${stored.objectKey}, ${stored.blobUrl},
      ${stored.storageProvider}, 'ready',
      'image/png', ${shot.bytes.byteLength}, ${shot.width}, ${shot.height}, ${checksum}, ${user.id}
    )
    returning id, label, checksum, width, height
  `;
  return asset;
}

const rev1HeroKey = `workspaces/${workspace.id}/rooms/${project.id}/revisions/r1/hero-home.png`;
const rev1InteriorKey = `workspaces/${workspace.id}/rooms/${project.id}/revisions/r1/interior-spread.png`;
const rev2HeroKey = `workspaces/${workspace.id}/rooms/${project.id}/revisions/r2/hero-home.png`;
const rev2MobileKey = `workspaces/${workspace.id}/rooms/${project.id}/revisions/r2/menu-mobile.png`;
const rev2ContactKey = `workspaces/${workspace.id}/rooms/${project.id}/revisions/r2/contact.png`;

const a1 = await insertImageAsset({
  label: "Homepage hero",
  specId: "rev1-hero",
  objectKey: rev1HeroKey,
});
const a2 = await insertImageAsset({
  label: "Interior spread",
  specId: "rev1-interior",
  objectKey: rev1InteriorKey,
});
const a3 = await insertImageAsset({
  label: "Homepage hero",
  specId: "rev2-hero",
  objectKey: rev2HeroKey,
});
const a4 = await insertImageAsset({
  label: "Menu — mobile",
  specId: "rev2-mobile",
  objectKey: rev2MobileKey,
});
const a5 = await insertImageAsset({
  label: "Contact page",
  specId: "rev2-contact",
  objectKey: rev2ContactKey,
});

const [rev1] = await sql`
  insert into revisions (workspace_id, project_id, number, status, published_at, superseded_at)
  values (${workspace.id}, ${project.id}, 1, 'SUPERSEDED', now() - interval '5 days', now() - interval '2 days')
  returning id, number
`;
const [rev2] = await sql`
  insert into revisions (workspace_id, project_id, number, status, published_at)
  values (${workspace.id}, ${project.id}, 2, 'PUBLISHED', now() - interval '1 day')
  returning id, number
`;

const [ra1] = await sql`
  insert into revision_assets (revision_id, asset_id, sort_order)
  values (${rev1.id}, ${a1.id}, 0) returning id
`;
const [ra2] = await sql`
  insert into revision_assets (revision_id, asset_id, sort_order)
  values (${rev1.id}, ${a2.id}, 1) returning id
`;
const [ra3] = await sql`
  insert into revision_assets (revision_id, asset_id, sort_order)
  values (${rev2.id}, ${a3.id}, 0) returning id
`;
const [ra4] = await sql`
  insert into revision_assets (revision_id, asset_id, sort_order)
  values (${rev2.id}, ${a4.id}, 1) returning id
`;
await sql`
  insert into revision_assets (revision_id, asset_id, sort_order)
  values (${rev2.id}, ${a5.id}, 2)
`;

const digest1 = computeRevisionDigest([
  { assetId: a1.id, sortOrder: 0, checksum: a1.checksum },
  { assetId: a2.id, sortOrder: 1, checksum: a2.checksum },
]);
const digest2 = computeRevisionDigest([
  { assetId: a3.id, sortOrder: 0, checksum: a3.checksum },
  { assetId: a4.id, sortOrder: 1, checksum: a4.checksum },
  { assetId: a5.id, sortOrder: 2, checksum: a5.checksum },
]);

await sql`update revisions set content_digest = ${digest1} where id = ${rev1.id}`;
await sql`update revisions set content_digest = ${digest2}, status = 'APPROVED' where id = ${rev2.id}`;

await audit(workspace.id, project.id, "user", user.id, "revision.published", "revision", rev1.id, {
  number: 1,
  digest: digest1,
});
await audit(workspace.id, project.id, "user", user.id, "revision.published", "revision", rev2.id, {
  number: 2,
  digest: digest2,
});

const shareToken = generateShareToken();
const tokenHash = sha256Hex(shareToken);
const [shareLink] = await sql`
  insert into share_links (
    workspace_id, project_id, token_hash, scope, status, created_by_user_id, view_count, last_viewed_at
  ) values (
    ${workspace.id}, ${project.id}, ${tokenHash}, 'review', 'ACTIVE', ${user.id}, 4, now() - interval '12 hours'
  )
  returning id
`;
await audit(workspace.id, project.id, "user", user.id, "share_link.created", "share_link", shareLink.id, {});
await audit(workspace.id, project.id, "system", null, "share_link.viewed", "share_link", shareLink.id, {
  viewCount: 4,
});

const [reviewer] = await sql`
  insert into reviewers (workspace_id, project_id, email, name)
  values (${workspace.id}, ${project.id}, ${REVIEWER_EMAIL}, ${REVIEWER_NAME})
  returning id, name, email
`;

// Revision 1 feedback: request changes + mixed comment states
await sql`
  insert into room_comments (
    workspace_id, project_id, revision_id, revision_asset_id, reviewer_id,
    x_percent, y_percent, body, status, resolved_at, resolved_by_user_id
  ) values
  (
    ${workspace.id}, ${project.id}, ${rev1.id}, ${ra1.id}, ${reviewer.id},
    0.42, 0.28, 'Can we soften the hero headline and make the reserve CTA more prominent?',
    'RESOLVED', now() - interval '3 days', ${user.id}
  ),
  (
    ${workspace.id}, ${project.id}, ${rev1.id}, ${ra1.id}, ${reviewer.id},
    0.68, 0.62, 'The photo feels cropped too tightly on the right — leave more table edge.',
    'RESOLVED', now() - interval '3 days', ${user.id}
  ),
  (
    ${workspace.id}, ${project.id}, ${rev1.id}, ${ra2.id}, ${reviewer.id},
    0.35, 0.48, 'Interior captions should match the menu typeface from the brand deck.',
    'OPEN', null, null
  )
`;

await sql`
  insert into approvals (
    workspace_id, project_id, revision_id, reviewer_id,
    acceptance_statement, content_digest, decision, approved_at, superseded_at
  ) values (
    ${workspace.id}, ${project.id}, ${rev1.id}, ${reviewer.id},
    'Changes requested', ${digest1}, 'changes_requested', now() - interval '4 days', null
  )
`;
await audit(
  workspace.id,
  project.id,
  "reviewer",
  reviewer.id,
  "revision.changes_requested",
  "revision",
  rev1.id,
  { revisionNumber: 1 },
);

// Revision 2 open + resolved comments, then approval
await sql`
  insert into room_comments (
    workspace_id, project_id, revision_id, revision_asset_id, reviewer_id,
    x_percent, y_percent, body, status, resolved_at, resolved_by_user_id
  ) values
  (
    ${workspace.id}, ${project.id}, ${rev2.id}, ${ra3.id}, ${reviewer.id},
    0.4, 0.3, 'Hero looks great — keep this crop.',
    'RESOLVED', now() - interval '18 hours', ${user.id}
  ),
  (
    ${workspace.id}, ${project.id}, ${rev2.id}, ${ra4.id}, ${reviewer.id},
    0.55, 0.7, 'Optional: add allergen note under the tasting menu.',
    'OPEN', null, null
  )
`;

const [approval] = await sql`
  insert into approvals (
    workspace_id, project_id, revision_id, reviewer_id,
    acceptance_statement, content_digest, decision, approved_at
  ) values (
    ${workspace.id}, ${project.id}, ${rev2.id}, ${reviewer.id},
    ${APPROVAL_STATEMENT}, ${digest2}, 'approved', now() - interval '6 hours'
  )
  returning id, approved_at
`;
await audit(
  workspace.id,
  project.id,
  "reviewer",
  reviewer.id,
  "revision.approved",
  "approval",
  approval.id,
  { digest: digest2, revisionNumber: 2 },
);

// Handoff fixtures
const pdfBytes = tinyPdf("Harbor & Co. Launch Spec");
const zipBytes = tinyZip();
const ogShot = generateDemoScreenshotPng({
  id: "og",
  label: "Open Graph",
  width: 1200,
  height: 630,
  bg: [246, 241, 234],
  accent: [99, 84, 212],
  layout: "hero",
});
const handoffPdfKey = `workspaces/${workspace.id}/rooms/${project.id}/handoff/launch-spec.pdf`;
const handoffZipKey = `workspaces/${workspace.id}/rooms/${project.id}/handoff/final-exports.zip`;
const handoffImgKey = `workspaces/${workspace.id}/rooms/${project.id}/handoff/og-image.png`;
const storedPdf = await writeFixture(handoffPdfKey, pdfBytes, "application/pdf");
const storedZip = await writeFixture(handoffZipKey, zipBytes, "application/zip");
const storedOg = await writeFixture(handoffImgKey, ogShot.bytes, "image/png");

const [pdfAsset] = await sql`
  insert into assets (
    workspace_id, project_id, kind, label, object_key, blob_url, storage_provider, upload_status,
    mime, bytes, checksum, uploaded_by_user_id
  ) values (
    ${workspace.id}, ${project.id}, 'pdf', 'Launch specification', ${storedPdf.objectKey}, ${storedPdf.blobUrl},
    ${storedPdf.storageProvider}, 'ready',
    'application/pdf', ${pdfBytes.byteLength}, ${sha256Hex(pdfBytes)}, ${user.id}
  ) returning id
`;
const [zipAsset] = await sql`
  insert into assets (
    workspace_id, project_id, kind, label, object_key, blob_url, storage_provider, upload_status,
    mime, bytes, checksum, uploaded_by_user_id
  ) values (
    ${workspace.id}, ${project.id}, 'file', 'Final Webflow exports', ${storedZip.objectKey}, ${storedZip.blobUrl},
    ${storedZip.storageProvider}, 'ready',
    'application/zip', ${zipBytes.byteLength}, ${sha256Hex(zipBytes)}, ${user.id}
  ) returning id
`;
const [ogAsset] = await sql`
  insert into assets (
    workspace_id, project_id, kind, label, object_key, blob_url, storage_provider, upload_status,
    mime, bytes, width, height, checksum, uploaded_by_user_id
  ) values (
    ${workspace.id}, ${project.id}, 'image', 'Open Graph image', ${storedOg.objectKey}, ${storedOg.blobUrl},
    ${storedOg.storageProvider}, 'ready',
    'image/png', ${ogShot.bytes.byteLength}, ${ogShot.width}, ${ogShot.height}, ${sha256Hex(ogShot.bytes)}, ${user.id}
  ) returning id
`;

await sql`
  insert into handoff_items (
    workspace_id, project_id, asset_id, external_url, label, category, notes, sort_order, created_by_user_id
  ) values
  (
    ${workspace.id}, ${project.id}, ${pdfAsset.id}, null,
    'Launch specification (PDF)', 'file', 'Page list, SEO titles, and CMS field notes for Webflow.', 0, ${user.id}
  ),
  (
    ${workspace.id}, ${project.id}, ${zipAsset.id}, null,
    'Final Webflow exports', 'file', 'ZIP of client-ready assets referenced in the build.', 1, ${user.id}
  ),
  (
    ${workspace.id}, ${project.id}, ${ogAsset.id}, null,
    'Open Graph image', 'file', '1200×630 social share image.', 2, ${user.id}
  ),
  (
    ${workspace.id}, ${project.id}, null, 'https://example.com/harbor-co-preview',
    'Staging site URL', 'link', 'Password shared separately by email. Replace with production URL at go-live.', 3, ${user.id}
  ),
  (
    ${workspace.id}, ${project.id}, null, null,
    'Launch notes', 'note', 'DNS cutover Friday 6pm local. Form notifications go to hello@harborandco.example.', 4, ${user.id}
  )
`;

await audit(workspace.id, project.id, "user", user.id, "handoff.item_added", "handoff_item", "demo-batch", {
  count: 5,
});
await audit(workspace.id, project.id, "user", user.id, "handoff.released", "project", project.id, {
  itemCount: 5,
});

await sql`
  update projects set
    status = 'APPROVED',
    current_published_revision_id = ${rev2.id},
    approved_revision_id = ${rev2.id},
    handoff_released_at = now() - interval '2 hours',
    updated_at = now()
  where id = ${project.id}
`;

const roomUrl = `${siteUrl}/rooms/${project.id}`;
const shareUrl = `${siteUrl}/share/${shareToken}`;
const referenceId = `PO-${approval.id.replace(/-/g, "").slice(0, 8).toUpperCase()}`;

console.log(
  JSON.stringify(
    {
      demo: true,
      project: {
        id: project.id,
        name: project.name,
        clientName: project.client_name,
        slug: project.slug,
      },
      revisionApproved: 2,
      approvalReferenceId: referenceId,
      ownerRoomUrl: roomUrl,
      clientShareUrl: shareUrl,
      note: "Share URL is shown once; re-run seed-demo to rotate the token.",
    },
    null,
    2,
  ),
);
