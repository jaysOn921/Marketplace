// Draws the app icons in public/icons/ from the placeholder TZed logo.
// Re-run after changing the logo: node apps/web/scripts/make-icons.mjs
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';

// sharp is a dependency of the API (it resizes uploaded photos).
const sharp = createRequire(new URL('../../api/package.json', import.meta.url))('sharp');

const out = new URL('../public/icons/', import.meta.url);
mkdirSync(out, { recursive: true });

/** The logo on a square. `pad` shrinks it into the middle (maskable icons get cropped). */
const svg = (pad, rounded) => {
  const s = 512;
  const inner = s - pad * 2;
  const k = inner / 64;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${s} ${s}">
  <rect width="${s}" height="${s}" rx="${rounded ? 112 : 0}" fill="#047857"/>
  <g transform="translate(${pad} ${pad}) scale(${k})">
    <text x="32" y="43" font-family="Arial, Helvetica, sans-serif" font-size="30" font-weight="700" text-anchor="middle" fill="#fff">TZ</text>
    <circle cx="50" cy="16" r="6" fill="#f59e0b"/>
  </g>
</svg>`;
};

const icons = [
  ['icon-192.png', 192, svg(0, true)],
  ['icon-512.png', 512, svg(0, true)],
  // Android crops maskable icons to its own shape: keep the logo inside the middle 80%.
  ['maskable-512.png', 512, svg(80, false)],
  ['maskable-192.png', 192, svg(80, false)],
  // iPhone home screen; iOS rounds the corners itself.
  ['apple-touch-icon.png', 180, svg(20, false)],
];
for (const [name, size, source] of icons) {
  await sharp(Buffer.from(source)).resize(size, size).png({ compressionLevel: 9 }).toFile(new URL(name, out).pathname);
  console.log('wrote', name);
}
