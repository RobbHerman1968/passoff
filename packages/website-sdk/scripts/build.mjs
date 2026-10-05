import { cp, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as esbuild from "esbuild";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = path.resolve(root, "../..");
const dist = path.join(root, "dist");
const publicSdk = path.join(repoRoot, "public/sdk/v1");
const src = path.join(root, "src");

const shared = {
  bundle: true,
  platform: "browser",
  target: ["es2020"],
  minify: true,
  sourcemap: false,
  legalComments: "none",
};

async function buildBootstrap({
  outfile,
  allowPrototype,
  reviewChunk,
  screenshotChunk,
  heatmapChunk,
}) {
  await esbuild.build({
    ...shared,
    entryPoints: [path.join(src, "browser.ts")],
    format: "iife",
    outfile,
    define: {
      __PASSOFF_ALLOW_PROTOTYPE__: allowPrototype ? "true" : "false",
      __PASSOFF_REVIEW_CHUNK__: JSON.stringify(reviewChunk),
      __PASSOFF_SCREENSHOT_CHUNK__: JSON.stringify(screenshotChunk),
      __PASSOFF_HEATMAP_CHUNK__: JSON.stringify(heatmapChunk),
    },
  });
}

async function buildChunk({ entry, outfile, screenshotChunk, heatmapChunk }) {
  await esbuild.build({
    ...shared,
    entryPoints: [path.join(src, entry)],
    format: "esm",
    outfile,
    define: {
      __PASSOFF_ALLOW_PROTOTYPE__: "false",
      __PASSOFF_REVIEW_CHUNK__: JSON.stringify("unused"),
      __PASSOFF_SCREENSHOT_CHUNK__: JSON.stringify(screenshotChunk),
      __PASSOFF_HEATMAP_CHUNK__: JSON.stringify(heatmapChunk),
    },
  });
}

async function build() {
  await mkdir(dist, { recursive: true });
  await mkdir(publicSdk, { recursive: true });

  // Development / harness artifacts (prototype session allowed).
  await buildBootstrap({
    outfile: path.join(dist, "passoff-sdk.js"),
    allowPrototype: true,
    reviewChunk: "passoff-sdk-review.js",
    screenshotChunk: "passoff-sdk-screenshot.js",
    heatmapChunk: "passoff-sdk-heatmap.js",
  });
  await buildChunk({
    entry: "review.ts",
    outfile: path.join(dist, "passoff-sdk-review.js"),
    screenshotChunk: "passoff-sdk-screenshot.js",
    heatmapChunk: "passoff-sdk-heatmap.js",
  });
  await buildChunk({
    entry: "screenshot.ts",
    outfile: path.join(dist, "passoff-sdk-screenshot.js"),
    screenshotChunk: "passoff-sdk-screenshot.js",
    heatmapChunk: "passoff-sdk-heatmap.js",
  });
  await buildChunk({
    entry: "heatmap.ts",
    outfile: path.join(dist, "passoff-sdk-heatmap.js"),
    screenshotChunk: "passoff-sdk-screenshot.js",
    heatmapChunk: "passoff-sdk-heatmap.js",
  });

  // Production artifacts (prototype session rejected).
  await buildBootstrap({
    outfile: path.join(publicSdk, "passoff.js"),
    allowPrototype: false,
    reviewChunk: "passoff-review.js",
    screenshotChunk: "passoff-screenshot.js",
    heatmapChunk: "passoff-heatmap.js",
  });
  await buildChunk({
    entry: "review.ts",
    outfile: path.join(publicSdk, "passoff-review.js"),
    screenshotChunk: "passoff-screenshot.js",
    heatmapChunk: "passoff-heatmap.js",
  });
  await buildChunk({
    entry: "screenshot.ts",
    outfile: path.join(publicSdk, "passoff-screenshot.js"),
    screenshotChunk: "passoff-screenshot.js",
    heatmapChunk: "passoff-heatmap.js",
  });
  await buildChunk({
    entry: "heatmap.ts",
    outfile: path.join(publicSdk, "passoff-heatmap.js"),
    screenshotChunk: "passoff-screenshot.js",
    heatmapChunk: "passoff-heatmap.js",
  });

  // Keep dist copies of production filenames for local measurement parity.
  await cp(path.join(publicSdk, "passoff.js"), path.join(dist, "passoff.js"));
  await cp(
    path.join(publicSdk, "passoff-review.js"),
    path.join(dist, "passoff-review.js"),
  );
  await cp(
    path.join(publicSdk, "passoff-screenshot.js"),
    path.join(dist, "passoff-screenshot.js"),
  );
  await cp(
    path.join(publicSdk, "passoff-heatmap.js"),
    path.join(dist, "passoff-heatmap.js"),
  );

  await writeFile(
    path.join(dist, "README.txt"),
    [
      "Passoff website SDK artifacts.",
      "- passoff-sdk*.js: development harness build (prototype session allowed)",
      "- passoff.js / passoff-review.js / passoff-screenshot.js / passoff-heatmap.js: production build",
      "Production copies are also written to public/sdk/v1/.",
      "",
    ].join("\n"),
  );
}

build().catch((error) => {
  console.error(error);
  process.exit(1);
});
