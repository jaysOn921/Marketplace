// Read-only smoke test of a deployed site, safe to run against production after a deploy:
// HTTPS and security headers, home page, search, a listing (if any are live), help
// centre, converter, sign-in page, phone layout, and no page errors. Changes no data.
// Usage: node tests/e2e/production-smoke.mjs https://tzed.example.com
//        INSECURE=1 node tests/e2e/production-smoke.mjs https://localhost   (Caddy's local certificate)
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright-core';

const base = (process.argv[2] ?? '').replace(/\/$/, '');
if (!base.startsWith('https://')) {
  console.error('Usage: node tests/e2e/production-smoke.mjs https://your-domain');
  process.exit(2);
}
const insecure = process.env.INSECURE === '1';
const browsers = process.env.PLAYWRIGHT_BROWSERS_PATH ?? '/opt/pw-browsers';
const chromiumDir =
  existsSync(browsers) && readdirSync(browsers).find((d) => /^chromium-\d+$/.test(d));
const executablePath =
  process.env.CHROMIUM_PATH ??
  (chromiumDir ? join(browsers, chromiumDir, 'chrome-linux', 'chrome') : undefined);
const out = 'tests/artifacts/';
const step = (s) => console.log('✓', s);
const problems = [];

const browser = await chromium.launch({ executablePath });
const context = await browser.newContext({
  viewport: { width: 1280, height: 900 },
  ignoreHTTPSErrors: insecure,
});
const page = await context.newPage();
page.on('pageerror', (e) => problems.push(`page error: ${e.message}`));
page.on('response', (r) => {
  if (r.status() >= 500) problems.push(`${r.status()} from ${r.url()}`);
});

// API health and headers
const health = await context.request.get(base + '/api/v1/health');
const body = await health.json().catch(() => ({}));
if (health.status() !== 200 || body.db !== 'ok')
  problems.push(`health: ${health.status()} ${JSON.stringify(body)}`);
const headers = health.headers();
for (const h of ['strict-transport-security', 'content-security-policy', 'x-content-type-options'])
  if (!headers[h]) problems.push(`missing header ${h}`);
step(`API healthy (version ${body.version}), security headers present`);

const rates = await (await context.request.get(base + '/api/v1/rates')).json();
const rate = rates.rates?.[0];
if (!rate) problems.push('no exchange rate set');
else step(`exchange rate K 1 = TSh ${rate.rate}, set ${rate.effectiveAt.slice(0, 10)}`);

// Pages
await page.goto(base + '/');
await page.getByRole('heading', { name: 'Buy and sell across Tanzania and Zambia' }).waitFor();
step('home page');

await page.goto(base + '/search?q=phone');
await page.getByRole('heading', { level: 1 }).first().waitFor();
await page.waitForLoadState('networkidle');
const firstListing = page.locator('main a[href^="/listings/"]').first();
if (await firstListing.count()) {
  await firstListing.click();
  await page.getByRole('region', { name: 'Order this item' }).waitFor();
  step('search and a listing page');
} else {
  step('search page (no live listings to open yet)');
}

await page.goto(base + '/help');
await page.getByRole('heading', { name: /help/i, level: 1 }).waitFor();
await page.goto(base + '/converter');
await page.getByRole('heading', { level: 1 }).waitFor();
await page.goto(base + '/login');
await page.getByRole('button', { name: 'Sign in' }).waitFor();
step('help centre, converter and sign-in pages');

await page.setViewportSize({ width: 390, height: 844 });
await page.goto(base + '/');
await page.getByRole('heading', { name: 'Buy and sell across Tanzania and Zambia' }).waitFor();
if (await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth))
  problems.push('home page scrolls sideways on a phone');
await page.screenshot({ path: out + 'production-home-mobile.png', fullPage: true });
step('phone layout');

console.log(problems.length ? '✗ problems:\n  ' + problems.join('\n  ') : '✓ all good');
if (problems.length) process.exitCode = 1;
await browser.close();
