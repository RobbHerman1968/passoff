import { gzipSync } from "node:zlib";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.join(root, "dist");

const proposed = {
  dormantParsedKb: 20,
  dormantGzipKb: 8,
  // Loaded only while a reviewer has an active review session, never for ordinary visitors.
  // Raised from the original 45 / 15 KB proposal after comments, approvals, video notes,
  // and verification hooks joined the review session (Story 8 decision, docs/LAUNCH_CHECKLIST.md).
  reviewParsedKb: 65,
  reviewGzipKb: 18,
  // Loaded only for signed-in team verification runs and for heatmap overlays.
  heatmapParsedKb: 12,
  heatmapGzipKb: 5,
  verificationParsedKb: 40,
  verificationGzipKb: 12,
  // Loaded only after a reviewer selects an area. Includes reliable DOM capture.
  screenshotParsedKb: 18,
  screenshotGzipKb: 7,
  analyticsParsedKb: 90,
  analyticsGzipKb: 30,
  addFeedbackReadyMs: 100,
  selectionDelayMs: 50,
  cls: 0,
};

function kb(bytes) {
  return Math.round((bytes / 1024) * 10) / 10;
}

async function measureFile(file) {
  const source = await readFile(path.join(dist, file));
  return {
    file,
    parsedBytes: source.byteLength,
    gzipBytes: gzipSync(source).byteLength,
    parsedKb: kb(source.byteLength),
    gzipKb: kb(gzipSync(source).byteLength),
  };
}

const artifacts = await Promise.all([
  measureFile("passoff.js"),
  measureFile("passoff-review.js"),
  measureFile("passoff-screenshot.js"),
  measureFile("passoff-sdk.js"),
  measureFile("passoff-analytics.js"),
  measureFile("passoff-heatmap.js"),
  measureFile("passoff-verification.js"),
]);

const payload = {
  measuredAt: new Date().toISOString(),
  environment: {
    node: process.version,
    platform: process.platform,
    arch: process.arch,
  },
  method: "UTF-8 file byte length plus zlib gzip (default level) after esbuild minify.",
  proposedBudgetsKb: proposed,
  artifacts,
};

await writeFile(
  path.join(dist, "size-report.json"),
  `${JSON.stringify(payload, null, 2)}\n`,
);

const budgetMap = {
  "passoff.js": [proposed.dormantParsedKb, proposed.dormantGzipKb],
  "passoff-review.js": [proposed.reviewParsedKb, proposed.reviewGzipKb],
  "passoff-screenshot.js": [proposed.screenshotParsedKb, proposed.screenshotGzipKb],
  "passoff-sdk.js": [proposed.dormantParsedKb, proposed.dormantGzipKb],
  "passoff-analytics.js": [proposed.analyticsParsedKb, proposed.analyticsGzipKb],
  "passoff-heatmap.js": [proposed.heatmapParsedKb, proposed.heatmapGzipKb],
  "passoff-verification.js": [proposed.verificationParsedKb, proposed.verificationGzipKb],
};

let overBudget = false;

for (const artifact of artifacts) {
  const budgets = budgetMap[artifact.file];
  if (!budgets) continue;
  const [parsedBudget, gzipBudget] = budgets;
  const parsedPass = artifact.parsedKb <= parsedBudget ? "within" : "over";
  const gzipPass = artifact.gzipKb <= gzipBudget ? "within" : "over";
  if (parsedPass === "over" || gzipPass === "over") overBudget = true;
  console.log(
    `${artifact.file}: parsed ${artifact.parsedKb} KB (${parsedPass} ${parsedBudget}), gzip ${artifact.gzipKb} KB (${gzipPass} ${gzipBudget})`,
  );
}

console.log(JSON.stringify(payload, null, 2));

if (overBudget) {
  console.error("SDK size budget exceeded. Shrink the bundle or record a reviewed budget change.");
  process.exitCode = 1;
}
