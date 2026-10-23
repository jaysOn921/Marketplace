// Takes desktop and mobile screenshots of app pages into tests/artifacts/.
// Usage: node scripts/screenshot.mjs [baseUrl] [path ...]
//   e.g. node scripts/screenshot.mjs http://localhost:4100 / /search?q=phone /help
// Uses the pre-installed Chromium (PLAYWRIGHT_BROWSERS_PATH) or CHROMIUM_PATH.
import { existsSync, mkdirSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright-core';

const [baseUrl = 'http://localhost:4100', ...paths] = process.argv.slice(2);
const pages = paths.length ? paths : ['/'];
const outDir = new URL('../tests/artifacts/', import.meta.url).pathname;
mkdirSync(outDir, { recursive: true });

function findChromium() {
  if (process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH;
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH ?? '/opt/pw-browsers';
  const dir = existsSync(root) && readdirSync(root).find((d) => /^chromium-\d+$/.test(d));
  return dir ? join(root, dir, 'chrome-linux', 'chrome') : undefined;
}

const viewports = {
  desktop: { width: 1280, height: 900 },
  mobile: { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
};

const browser = await chromium.launch({ executablePath: findChromium() });
try {
  for (const [name, vp] of Object.entries(viewports)) {
    const { width, height, ...rest } = vp;
    const context = await browser.newContext({ viewport: { width, height }, ...rest });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    for (const p of pages) {
      await page.goto(baseUrl + p, { waitUntil: 'networkidle' });
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth,
      );
      const slug = p.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '') || 'home';
      const file = join(outDir, `${slug}-${name}.png`);
      await page.screenshot({ path: file, fullPage: true });
      console.log(`${name.padEnd(7)} ${p} -> ${file}${overflow ? '  ⚠ horizontal overflow' : ''}`);
    }
    if (errors.length) console.log(`${name} console errors:\n  ${errors.join('\n  ')}`);
    await context.close();
  }
} finally {
  await browser.close();
}
