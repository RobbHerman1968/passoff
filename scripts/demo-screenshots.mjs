/**
 * Deterministic demo website revision PNGs for local seed fixtures.
 * Pure Node — no sharp dependency so seed scripts stay lightweight.
 */

import { deflateSync } from "node:zlib";

/** @typedef {{ id: string; label: string; width: number; height: number; bg: [number, number, number]; accent: [number, number, number]; layout: "hero" | "mobile-menu" | "contact" }} DemoScreenshotSpec */

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
  },
  {
    id: "rev1-interior",
    label: "Interior spread (r1)",
    width: 960,
    height: 600,
    bg: [238, 232, 222],
    accent: [180, 110, 70],
    layout: "hero",
  },
  {
    id: "rev2-hero",
    label: "Homepage hero (r2)",
    width: 960,
    height: 600,
    bg: [250, 247, 242],
    accent: [55, 120, 100],
    layout: "hero",
  },
  {
    id: "rev2-mobile",
    label: "Menu — mobile (r2)",
    width: 390,
    height: 844,
    bg: [252, 250, 246],
    accent: [99, 84, 212],
    layout: "mobile-menu",
  },
  {
    id: "rev2-contact",
    label: "Contact page (r2)",
    width: 960,
    height: 600,
    bg: [244, 248, 250],
    accent: [40, 90, 140],
    layout: "contact",
  },
];

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
  }
  return ~c >>> 0;
}

function pngChunk(type, data) {
  const typeBuf = Buffer.from(type, "ascii");
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const crcBuf = Buffer.concat([typeBuf, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(crcBuf), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

function setPixel(raw, width, x, y, rgb) {
  const idx = y * (1 + width * 3) + 1 + x * 3;
  raw[idx] = rgb[0];
  raw[idx + 1] = rgb[1];
  raw[idx + 2] = rgb[2];
}

function fillRect(raw, width, height, x0, y0, w, h, rgb) {
  const x1 = Math.min(width, Math.max(0, x0 + w));
  const y1 = Math.min(height, Math.max(0, y0 + h));
  const xs = Math.max(0, x0);
  const ys = Math.max(0, y0);
  for (let y = ys; y < y1; y++) {
    for (let x = xs; x < x1; x++) setPixel(raw, width, x, y, rgb);
  }
}

/** @param {DemoScreenshotSpec} spec */
function drawLayout(spec, raw) {
  const { width, height, bg, accent, layout } = spec;
  fillRect(raw, width, height, 0, 0, width, height, bg);

  fillRect(raw, width, height, 0, 0, width, Math.max(36, Math.floor(height * 0.08)), [255, 255, 255]);
  fillRect(raw, width, height, 24, 14, 72, 12, accent);
  fillRect(raw, width, height, width - 120, 14, 40, 12, [200, 200, 200]);
  fillRect(raw, width, height, width - 70, 14, 40, 12, [180, 180, 180]);

  if (layout === "hero") {
    fillRect(raw, width, height, 40, Math.floor(height * 0.18), Math.floor(width * 0.42), 18, [30, 30, 30]);
    fillRect(raw, width, height, 40, Math.floor(height * 0.24), Math.floor(width * 0.35), 12, [90, 90, 90]);
    fillRect(raw, width, height, 40, Math.floor(height * 0.32), 110, 36, accent);
    fillRect(
      raw,
      width,
      height,
      Math.floor(width * 0.52),
      Math.floor(height * 0.16),
      Math.floor(width * 0.4),
      Math.floor(height * 0.55),
      [accent[0], accent[1], Math.min(255, accent[2] + 40)],
    );
    fillRect(raw, width, height, Math.floor(width * 0.4), Math.floor(height * 0.28), 16, 16, [220, 60, 60]);
    fillRect(raw, width, height, Math.floor(width * 0.68), Math.floor(height * 0.62), 16, 16, [220, 60, 60]);
  } else if (layout === "mobile-menu") {
    fillRect(raw, width, height, 20, 80, width - 40, 48, [255, 255, 255]);
    fillRect(raw, width, height, 36, 96, width - 72, 14, [40, 40, 40]);
    for (let i = 0; i < 5; i++) {
      const y = 160 + i * 72;
      fillRect(raw, width, height, 20, y, width - 40, 56, [255, 255, 255]);
      fillRect(raw, width, height, 36, y + 20, Math.floor(width * 0.45), 12, [70, 70, 70]);
    }
    fillRect(raw, width, height, 20, height - 100, width - 40, 48, accent);
    fillRect(raw, width, height, Math.floor(width * 0.55), Math.floor(height * 0.7), 16, 16, [220, 60, 60]);
  } else {
    fillRect(raw, width, height, 48, 100, Math.floor(width * 0.35), 16, [30, 30, 30]);
    fillRect(raw, width, height, 48, 140, Math.floor(width * 0.4), 120, [255, 255, 255]);
    fillRect(raw, width, height, 64, 160, Math.floor(width * 0.32), 12, [180, 180, 180]);
    fillRect(raw, width, height, 64, 190, Math.floor(width * 0.32), 12, [180, 180, 180]);
    fillRect(raw, width, height, 64, 220, 100, 28, accent);
    fillRect(
      raw,
      width,
      height,
      Math.floor(width * 0.55),
      120,
      Math.floor(width * 0.35),
      Math.floor(height * 0.5),
      [210, 220, 230],
    );
    fillRect(raw, width, height, Math.floor(width * 0.4), Math.floor(height * 0.48), 16, 16, [220, 60, 60]);
  }
}

/**
 * Build a real PNG whose IHDR width/height match the returned dimensions.
 * @param {DemoScreenshotSpec} spec
 */
export function generateDemoScreenshotPng(spec) {
  const { width, height } = spec;
  const raw = Buffer.alloc((width * 3 + 1) * height, 0);
  for (let y = 0; y < height; y++) {
    raw[y * (1 + width * 3)] = 0;
  }
  drawLayout(spec, raw);

  const compressed = deflateSync(raw, { level: 9 });
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const bytes = Buffer.concat([
    signature,
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", compressed),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);

  return { bytes, width, height };
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
