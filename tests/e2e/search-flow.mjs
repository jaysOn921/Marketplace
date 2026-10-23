// Browser smoke test of search, using the dev seed data:
// home page sections → suggestions while typing → keyword search → filters (available in
// Zambia, price range in K) → sort → shop page → mobile filters panel. Checks for
// horizontal overflow on phones and takes screenshots into tests/artifacts/.
// Needs the dev servers running (npm run dev) and the dev seed.
// Usage: node tests/e2e/search-flow.mjs [baseUrl]
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright-core';

const base = process.argv[2] ?? 'http://localhost:5173';
const browsers = process.env.PLAYWRIGHT_BROWSERS_PATH ?? '/opt/pw-browsers';
const chromiumDir =
  existsSync(browsers) && readdirSync(browsers).find((d) => /^chromium-\d+$/.test(d));
const executablePath =
  process.env.CHROMIUM_PATH ??
  (chromiumDir ? join(browsers, chromiumDir, 'chrome-linux', 'chrome') : undefined);
const out = 'tests/artifacts/';
const step = (s) => console.log('✓', s);
const errors = [];
const browser = await chromium.launch({ executablePath });

async function page(viewport) {
  const p = await (await browser.newContext({ viewport })).newPage();
  p.on('pageerror', (e) => errors.push(e.message));
  return p;
}
const overflow = (p) => p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);

// Desktop
const d = await page({ width: 1280, height: 900 });
await d.goto(base + '/');
await d.getByRole('heading', { name: 'From Tanzania, available in Zambia' }).waitFor();
await d.getByRole('heading', { name: 'Latest listings' }).waitFor();
step('home page shows cross-border and latest sections');
await d.screenshot({ path: out + 'phase4-home-desktop.png', fullPage: true });

const box = d.getByRole('combobox', { name: 'Search listings' }).first();
await box.fill('sof');
await d.getByRole('option', { name: /3-seater fabric sofa/ }).waitFor();
step('suggestions appear while typing');
await d.screenshot({ path: out + 'phase4-suggest-desktop.png' });
await box.fill('samsung');
await box.press('Enter');
await d.getByRole('heading', { name: 'Results for “samsung”' }).waitFor();
await d.getByRole('link', { name: /Samsung Galaxy A15/ }).waitFor();
step('keyword search finds the Samsung');

await d.goto(base + '/search');
await d.getByText(/\d+ listings/).waitFor();
await d.getByLabel('Buyers in Zambia').click();
await d.getByRole('button', { name: 'Remove filter: Buyers in Zambia' }).waitFor();
await d.getByRole('button', { name: 'K (ZMW)' }).click();
await d.getByLabel('Minimum price in ZMW').fill('300');
await d.getByLabel('Maximum price in ZMW').fill('5000');
await d.getByRole('button', { name: 'Apply price' }).click();
await d.getByRole('button', { name: 'Remove filter: K 300.00 – K 5,000.00' }).waitFor();
await d.getByLabel('Sort by').selectOption({ label: 'Price: low to high' });
await d.waitForURL(/sort=price_asc/);
await d.waitForTimeout(400);
const titles = await d.locator('main ul li h3').allTextContents();
console.log('   available in ZM, K300–5000, price ↑:', titles.join(' | '));
step('filters + sort applied');
await d.screenshot({ path: out + 'phase4-search-desktop.png', fullPage: true });

await d.goto(base + '/shop/amina-electronics');
await d.getByRole('heading', { name: 'Amina Electronics' }).waitFor();
await d.getByText(/live listings?/).waitFor();
step('shop page lists the seller’s items');

// Mobile
const m = await page({ width: 390, height: 844 });
await m.goto(base + '/search?q=phone');
await m.getByText(/\d+ listings?/).waitFor();
if (await overflow(m)) errors.push('horizontal overflow on mobile search');
await m.getByRole('button', { name: /Filters \(\d\)/ }).click();
await m.getByLabel('Buyers in Tanzania').click();
await m.getByRole('button', { name: /Remove filter: Buyers in Tanzania/ }).waitFor();
step('mobile filters panel works');
await m.screenshot({ path: out + 'phase4-search-mobile.png', fullPage: true });
await m.goto(base + '/');
await m.getByRole('heading', { name: 'Latest listings' }).waitFor();
if (await overflow(m)) errors.push('horizontal overflow on mobile home');
await m.screenshot({ path: out + 'phase4-home-mobile.png', fullPage: true });

console.log(
  errors.length ? 'problems: ' + errors.join('; ') : '✓ no page errors, no mobile overflow',
);
if (errors.length) process.exitCode = 1;
await browser.close();
