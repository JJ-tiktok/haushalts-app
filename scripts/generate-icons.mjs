/**
 * Erzeugt die PWA-Icons ohne externe Bildbibliothek.
 * Aufruf: npm run icons
 */
import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "icons");

const BG = [0x3f, 0x6b, 0x5a];
const FG = [0xf6, 0xf5, 0xf2];

// --- PNG-Encoder ------------------------------------------------------------

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

function encodePng(width, height, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  // 10-12: compression, filter, interlace = 0

  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // Filter "None"
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// --- Zeichnen (Koordinaten normiert auf 0..1) --------------------------------

function inRoundedSquare(x, y, radius) {
  const dx = Math.max(Math.abs(x - 0.5) - (0.5 - radius), 0);
  const dy = Math.max(Math.abs(y - 0.5) - (0.5 - radius), 0);
  return Math.hypot(dx, dy) <= radius;
}

function inTriangle(px, py, [ax, ay], [bx, by], [cx, cy]) {
  const sign = (x1, y1, x2, y2, x3, y3) => (x1 - x3) * (y2 - y3) - (x2 - x3) * (y1 - y3);
  const d1 = sign(px, py, ax, ay, bx, by);
  const d2 = sign(px, py, bx, by, cx, cy);
  const d3 = sign(px, py, cx, cy, ax, ay);
  const hasNeg = d1 < 0 || d2 < 0 || d3 < 0;
  const hasPos = d1 > 0 || d2 > 0 || d3 > 0;
  return !(hasNeg && hasPos);
}

/** Abstand Punkt zu Strecke – für Striche mit runden Enden. */
function distanceToSegment(px, py, [ax, ay], [bx, by]) {
  const vx = bx - ax;
  const vy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * vx + (py - ay) * vy) / (vx * vx + vy * vy)));
  return Math.hypot(px - (ax + t * vx), py - (ay + t * vy));
}

/**
 * Haus mit Häkchen: Dach als Dreieck, Korpus als Rechteck, darin ein Haken.
 * `scale` schrumpft das Motiv für maskable Icons in die Safe-Zone.
 */
function motifCoverage(x, y, scale) {
  const mx = (x - 0.5) / scale + 0.5;
  const my = (y - 0.5) / scale + 0.5;

  const roof = inTriangle(mx, my, [0.5, 0.17], [0.13, 0.5], [0.87, 0.5]);
  const body = mx >= 0.22 && mx <= 0.78 && my >= 0.46 && my <= 0.83;
  const house = roof || body;
  if (!house) return 0;

  // Haken als Aussparung im Korpus
  const stroke = 0.055;
  const check =
    distanceToSegment(mx, my, [0.36, 0.65], [0.46, 0.74]) <= stroke ||
    distanceToSegment(mx, my, [0.46, 0.74], [0.65, 0.55]) <= stroke;

  return check ? 0 : 1;
}

function render(size, { maskable }) {
  const rgba = Buffer.alloc(size * size * 4);
  const samples = 3;
  const motifScale = maskable ? 0.74 : 1;
  const cornerRadius = maskable ? 0.5 : 0.22;

  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let bgHits = 0;
      let fgHits = 0;

      for (let sy = 0; sy < samples; sy++) {
        for (let sx = 0; sx < samples; sx++) {
          const x = (px + (sx + 0.5) / samples) / size;
          const y = (py + (sy + 0.5) / samples) / size;

          // Maskable: volle Fläche. Sonst abgerundetes Quadrat.
          const insideBg = maskable ? true : inRoundedSquare(x, y, cornerRadius);
          if (!insideBg) continue;
          bgHits += 1;
          fgHits += motifCoverage(x, y, motifScale);
        }
      }

      const total = samples * samples;
      const alpha = bgHits / total;
      const fg = bgHits > 0 ? fgHits / bgHits : 0;

      const i = (py * size + px) * 4;
      for (let c = 0; c < 3; c++) {
        rgba[i + c] = Math.round(BG[c] * (1 - fg) + FG[c] * fg);
      }
      rgba[i + 3] = Math.round(alpha * 255);
    }
  }

  return encodePng(size, size, rgba);
}

mkdirSync(OUT_DIR, { recursive: true });

const files = [
  ["icon-192.png", render(192, { maskable: false })],
  ["icon-512.png", render(512, { maskable: false })],
  ["icon-maskable-512.png", render(512, { maskable: true })],
];

for (const [name, buffer] of files) {
  writeFileSync(join(OUT_DIR, name), buffer);
  console.log(`${name} – ${(buffer.length / 1024).toFixed(1)} kB`);
}
