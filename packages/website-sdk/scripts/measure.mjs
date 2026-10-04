import { gzipSync } from "node:zlib";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.join(root, "dist");

const proposed = {
  dormantParsedKb: 20,
  dormantGzipKb: 8,
  reviewParsedKb: 45,
  reviewGzipKb: 15,
  screenshotParsedKb: 12,
  screenshotGzipKb: 5,
  initMs: 50,
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
};

for (const artifact of artifacts) {
  const budgets = budgetMap[artifact.file];
  if (!budgets) continue;
  const [parsedBudget, gzipBudget] = budgets;
  const parsedPass = artifact.parsedKb <= parsedBudget ? "within" : "over";
  const gzipPass = artifact.gzipKb <= gzipBudget ? "within" : "over";
  console.log(
    `${artifact.file}: parsed ${artifact.parsedKb} KB (${parsedPass} ${parsedBudget}), gzip ${artifact.gzipKb} KB (${gzipPass} ${gzipBudget})`,
  );
}

console.log(JSON.stringify(payload, null, 2));
