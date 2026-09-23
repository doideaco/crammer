/**
 * Generates placeholder images in public/images so every photo template has something
 * to show in Remotion Studio before the pipeline has ever run.
 *
 * These are obviously synthetic on purpose: a fixture must never be mistaken for a real
 * licensed photograph.
 *
 * Run with: pnpm --filter @crammer/video gen:fixtures
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, "..", "public", "images");
mkdirSync(outDir, { recursive: true });

const PLACEHOLDERS: { name: string; label: string; hue: number }[] = [
  { name: "fixture-port", label: "Port", hue: 205 },
  { name: "fixture-city", label: "City", hue: 28 },
  { name: "fixture-ship", label: "Ship", hue: 188 },
  { name: "fixture-portrait-a", label: "Person A", hue: 340 },
  { name: "fixture-portrait-b", label: "Person B", hue: 268 },
];

const W = 1920;
const H = 1080;

for (const { name, label, hue } of PLACEHOLDERS) {
  // A flat two-tone field with a grid, so pan/zoom motion is visible at a glance.
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
  <rect width="${W}" height="${H}" fill="hsl(${hue}, 24%, 52%)"/>
  <rect y="${H * 0.62}" width="${W}" height="${H * 0.38}" fill="hsl(${hue}, 28%, 38%)"/>
  <g stroke="hsla(0,0%,100%,0.16)" stroke-width="2">
    ${Array.from({ length: 12 }, (_, i) => `<line x1="${(i * W) / 12}" y1="0" x2="${(i * W) / 12}" y2="${H}"/>`).join("")}
    ${Array.from({ length: 7 }, (_, i) => `<line x1="0" y1="${(i * H) / 7}" x2="${W}" y2="${(i * H) / 7}"/>`).join("")}
  </g>
  <text x="${W / 2}" y="${H / 2}" fill="hsla(0,0%,100%,0.9)" font-family="Inter, sans-serif"
        font-size="120" font-weight="700" text-anchor="middle" dominant-baseline="middle">${label}</text>
  <text x="${W / 2}" y="${H / 2 + 100}" fill="hsla(0,0%,100%,0.6)" font-family="Inter, sans-serif"
        font-size="34" font-weight="500" text-anchor="middle" dominant-baseline="middle">fixture placeholder — not a real photograph</text>
</svg>`;

  const buffer = Buffer.from(svg);
  const file = join(outDir, `${name}.jpg`);
  await sharp(buffer).jpeg({ quality: 82 }).toFile(file);
  console.log(`Wrote ${file}`);
}

// A short silent MP3 so audio-bearing fixtures exercise the same code path as a real run
// without shipping a voice recording into the repo.
const silence = Buffer.from(
  "//uQxAAAAAAAAAAAAAAAAAAAAAAASW5mbwAAAA8AAAACAAABhgC7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7//////////////////////////////////////////8AAAAATGF2YzU4LjEz",
  "base64",
);
const audioDir = join(here, "..", "public", "audio");
mkdirSync(audioDir, { recursive: true });
writeFileSync(join(audioDir, "fixture-silence.mp3"), silence);
console.log(`Wrote ${join(audioDir, "fixture-silence.mp3")}`);
