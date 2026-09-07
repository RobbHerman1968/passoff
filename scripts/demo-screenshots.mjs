/**
 * Deterministic demo website revision PNGs for local seed fixtures.
 * Uses sharp (already a project dependency) + SVG for credible agency-site screenshots.
 */

import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
/** @type {typeof import("sharp")} */
const sharp = require("sharp");

/** @typedef {{ id: string; label: string; width: number; height: number; bg: [number, number, number]; accent: [number, number, number]; layout: "hero" | "mobile-menu" | "contact"; revision?: 1 | 2 }} DemoScreenshotSpec */

/** @type {DemoScreenshotSpec[]} */
export const DEMO_SCREENSHOT_SPECS = [
  {
    id: "rev1-hero",
    label: "Homepage hero (r1)",
    width: 960,
    height: 600,
    bg: [246, 241, 234],
    accent: [99, 84, 212],
    layout: "hero",
    revision: 1,
  },
  {
    id: "rev1-interior",
    label: "Interior spread (r1)",
    width: 960,
    height: 600,
    bg: [238, 232, 222],
    accent: [180, 110, 70],
    layout: "hero",
    revision: 1,
  },
  {
    id: "rev2-hero",
    label: "Homepage hero (r2)",
    width: 960,
    height: 600,
    bg: [250, 247, 242],
    accent: [55, 120, 100],
    layout: "hero",
    revision: 2,
  },
  {
    id: "rev2-mobile",
    label: "Menu — mobile (r2)",
    width: 390,
    height: 844,
    bg: [252, 250, 246],
    accent: [99, 84, 212],
    layout: "mobile-menu",
    revision: 2,
  },
  {
    id: "rev2-contact",
    label: "Contact page (r2)",
    width: 960,
    height: 600,
    bg: [244, 248, 250],
    accent: [40, 90, 140],
    layout: "contact",
    revision: 2,
  },
];

function rgb([r, g, b]) {
  return `rgb(${r},${g},${b})`;
}

function xmlEscape(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function lighter(c, amount = 40) {
  return [
    Math.min(255, c[0] + amount),
    Math.min(255, c[1] + amount),
    Math.min(255, c[2] + amount),
  ];
}

function darker(c, amount = 40) {
  return [
    Math.max(0, c[0] - amount),
    Math.max(0, c[1] - amount),
    Math.max(0, c[2] - amount),
  ];
}

/** @param {DemoScreenshotSpec} spec */
function buildSvg(spec) {
  const { width, height, bg, accent, layout, revision = 1 } = spec;
  const brand = xmlEscape(revision === 1 ? "Harbor & Co." : "Harbor Studio");
  const cta = xmlEscape(revision === 1 ? "Reserve a table" : "Book tonight");
  const nav = (revision === 1 ? ["Menu", "Story", "Visit"] : ["Menus", "Events", "Contact"]).map(
    xmlEscape,
  );
  const pinColor = "#dc3c3c";

  if (layout === "mobile-menu") {
    const items = (
      revision === 1
        ? ["Oysters", "Grilled catch", "Seasonal greens", "Pastries", "Cocktails"]
        : ["Raw bar", "Wood-fired plates", "Garden sides", "Dessert", "Wine list"]
    ).map(xmlEscape);
    return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${rgb(bg)}"/>
      <stop offset="100%" stop-color="${rgb(lighter(bg, 8))}"/>
    </linearGradient>
  </defs>
  <rect width="100%" height="100%" fill="url(#bg)"/>
  <rect x="0" y="0" width="${width}" height="64" fill="#ffffff" opacity="0.92"/>
  <text x="20" y="40" font-family="Georgia, 'Times New Roman', serif" font-size="22" fill="${rgb(darker(accent, 20))}">${brand}</text>
  <rect x="330" y="22" width="36" height="4" rx="2" fill="#222"/>
  <rect x="330" y="32" width="36" height="4" rx="2" fill="#222"/>
  <rect x="330" y="42" width="28" height="4" rx="2" fill="#222"/>
  <text x="20" y="110" font-family="system-ui, sans-serif" font-size="13" fill="#777" letter-spacing="2">MENU</text>
  ${items
    .map(
      (item, i) => `
  <rect x="20" y="${140 + i * 88}" width="${width - 40}" height="72" rx="14" fill="#ffffff" stroke="rgba(0,0,0,0.06)"/>
  <rect x="36" y="${156 + i * 88}" width="48" height="40" rx="8" fill="${rgb(lighter(accent, 70))}"/>
  <text x="100" y="${182 + i * 88}" font-family="Georgia, serif" font-size="20" fill="#1a1a1a">${item}</text>
  <text x="100" y="${202 + i * 88}" font-family="system-ui, sans-serif" font-size="12" fill="#888">Chef's notes · $${18 + i * 4}</text>`,
    )
    .join("")}
  <rect x="20" y="${height - 96}" width="${width - 40}" height="56" rx="14" fill="${rgb(accent)}"/>
  <text x="${width / 2}" y="${height - 60}" text-anchor="middle" font-family="system-ui, sans-serif" font-size="16" font-weight="600" fill="#fff">${cta}</text>
  <circle cx="${Math.floor(width * 0.78)}" cy="${Math.floor(height * 0.42)}" r="10" fill="${pinColor}"/>
  <circle cx="${Math.floor(width * 0.78)}" cy="${Math.floor(height * 0.42)}" r="4" fill="#fff"/>
</svg>`;
  }

  if (layout === "contact") {
    return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${rgb(bg)}"/>
      <stop offset="100%" stop-color="#e8eef2"/>
    </linearGradient>
    <linearGradient id="map" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#c5d5e0"/>
      <stop offset="100%" stop-color="#9bb4c6"/>
    </linearGradient>
  </defs>
  <rect width="100%" height="100%" fill="url(#bg)"/>
  <rect x="0" y="0" width="${width}" height="64" fill="#ffffff"/>
  <text x="32" y="40" font-family="Georgia, serif" font-size="22" fill="${rgb(accent)}">${brand}</text>
  ${nav
    .map(
      (label, i) =>
        `<text x="${width - 220 + i * 70}" y="40" font-family="system-ui, sans-serif" font-size="13" fill="#555">${label}</text>`,
    )
    .join("")}
  <text x="48" y="130" font-family="Georgia, serif" font-size="36" fill="#1c1c1c">Visit us</text>
  <text x="48" y="168" font-family="system-ui, sans-serif" font-size="15" fill="#666">Pier 19 · Harbor District · Open daily 5–11pm</text>
  <rect x="48" y="200" width="360" height="280" rx="16" fill="#ffffff" stroke="rgba(0,0,0,0.06)"/>
  <rect x="72" y="232" width="280" height="16" rx="4" fill="#e6e6e6"/>
  <rect x="72" y="268" width="240" height="16" rx="4" fill="#e6e6e6"/>
  <rect x="72" y="304" width="300" height="72" rx="8" fill="#f3f5f7"/>
  <rect x="72" y="400" width="140" height="40" rx="10" fill="${rgb(accent)}"/>
  <text x="100" y="426" font-family="system-ui, sans-serif" font-size="14" fill="#fff">Send message</text>
  <rect x="${Math.floor(width * 0.52)}" y="190" width="${Math.floor(width * 0.42)}" height="300" rx="16" fill="url(#map)"/>
  <circle cx="${Math.floor(width * 0.7)}" cy="320" r="14" fill="${rgb(accent)}"/>
  <circle cx="${Math.floor(width * 0.7)}" cy="320" r="5" fill="#fff"/>
  <text x="${Math.floor(width * 0.55)}" y="230" font-family="system-ui, sans-serif" font-size="13" fill="#334">Waterfront map</text>
  <circle cx="${Math.floor(width * 0.42)}" cy="${Math.floor(height * 0.48)}" r="10" fill="${pinColor}"/>
  <circle cx="${Math.floor(width * 0.42)}" cy="${Math.floor(height * 0.48)}" r="4" fill="#fff"/>
</svg>`;
  }

  // hero (+ interior uses same structure with different copy/colors)
  const heroTitle = xmlEscape(
    spec.id.includes("interior")
      ? revision === 1
        ? "Private dining rooms"
        : "Quiet rooms for gatherings"
      : revision === 1
        ? "Coastal dining, elevated."
        : "A calmer table by the water.",
  );
  const heroSub = xmlEscape(
    spec.id.includes("interior")
      ? revision === 1
        ? "Long tables, soft light, harbor views."
        : "Book the loft or the wine cellar."
      : revision === 1
        ? "Seasonal menus and late-night reservations."
        : "Reservations, private events, and tasting menus.",
  );
  const cardLabels = (
    revision === 1 ? ["Brunch", "Dinner", "Events"] : ["Tasting", "Bar", "Catering"]
  ).map(xmlEscape);

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${rgb(bg)}"/>
      <stop offset="100%" stop-color="${rgb(lighter(bg, 12))}"/>
    </linearGradient>
    <linearGradient id="photo" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${rgb(lighter(accent, 50))}"/>
      <stop offset="55%" stop-color="${rgb(accent)}"/>
      <stop offset="100%" stop-color="${rgb(darker(accent, 30))}"/>
    </linearGradient>
    <linearGradient id="photoShade" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="rgba(255,255,255,0.25)"/>
      <stop offset="100%" stop-color="rgba(0,0,0,0.25)"/>
    </linearGradient>
  </defs>
  <rect width="100%" height="100%" fill="url(#bg)"/>
  <rect x="0" y="0" width="${width}" height="68" fill="#ffffff" opacity="0.95"/>
  <text x="36" y="42" font-family="Georgia, 'Times New Roman', serif" font-size="24" fill="${rgb(darker(accent, 15))}">${brand}</text>
  ${nav
    .map(
      (label, i) =>
        `<text x="${width - 250 + i * 78}" y="42" font-family="system-ui, -apple-system, sans-serif" font-size="14" fill="#444">${label}</text>`,
    )
    .join("")}
  <text x="48" y="160" font-family="Georgia, serif" font-size="44" fill="#171717">${heroTitle}</text>
  <text x="48" y="200" font-family="system-ui, sans-serif" font-size="16" fill="#5a5a5a">${heroSub}</text>
  <rect x="48" y="230" width="168" height="44" rx="12" fill="${rgb(accent)}"/>
  <text x="132" y="258" text-anchor="middle" font-family="system-ui, sans-serif" font-size="15" font-weight="600" fill="#fff">${cta}</text>
  <rect x="${Math.floor(width * 0.5)}" y="110" width="${Math.floor(width * 0.42)}" height="${Math.floor(height * 0.48)}" rx="18" fill="url(#photo)"/>
  <rect x="${Math.floor(width * 0.5)}" y="110" width="${Math.floor(width * 0.42)}" height="${Math.floor(height * 0.48)}" rx="18" fill="url(#photoShade)"/>
  <text x="${Math.floor(width * 0.71)}" y="${Math.floor(height * 0.38)}" text-anchor="middle" font-family="Georgia, serif" font-size="20" fill="#fff" opacity="0.9">Dining room</text>
  ${cardLabels
    .map((label, i) => {
      const x = 48 + i * 200;
      return `
  <rect x="${x}" y="${Math.floor(height * 0.72)}" width="180" height="110" rx="14" fill="#ffffff" stroke="rgba(0,0,0,0.05)"/>
  <rect x="${x + 16}" y="${Math.floor(height * 0.72) + 16}" width="148" height="48" rx="8" fill="${rgb(lighter(accent, 75))}"/>
  <text x="${x + 24}" y="${Math.floor(height * 0.72) + 90}" font-family="Georgia, serif" font-size="16" fill="#222">${label}</text>`;
    })
    .join("")}
  <circle cx="${Math.floor(width * 0.42)}" cy="${Math.floor(height * 0.3)}" r="11" fill="${pinColor}"/>
  <circle cx="${Math.floor(width * 0.42)}" cy="${Math.floor(height * 0.3)}" r="4" fill="#fff"/>
  <circle cx="${Math.floor(width * 0.72)}" cy="${Math.floor(height * 0.58)}" r="11" fill="${pinColor}"/>
  <circle cx="${Math.floor(width * 0.72)}" cy="${Math.floor(height * 0.58)}" r="4" fill="#fff"/>
</svg>`;
}

/**
 * Build a real PNG whose IHDR width/height match the returned dimensions.
 * @param {DemoScreenshotSpec} spec
 */
export async function generateDemoScreenshotPng(spec) {
  const svg = buildSvg(spec);
  const bytes = await sharp(Buffer.from(svg))
    .png({ compressionLevel: 9, palette: true })
    .toBuffer();
  return { bytes, width: spec.width, height: spec.height };
}

/** @param {Buffer} bytes */
export function readPngDimensions(bytes) {
  if (bytes.length < 24) throw new Error("Not a PNG.");
  if (bytes.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a") {
    throw new Error("Missing PNG signature.");
  }
  return {
    width: bytes.readUInt32BE(16),
    height: bytes.readUInt32BE(20),
  };
}
