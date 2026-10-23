// Browser smoke test of reviews: the demo Zambian buyer reviews a completed order (run
// tests/e2e/order-flow.mjs first to create one), then the rating shows on the shop page
// and on search result cards.
// Needs the dev servers running (npm run dev) and the dev seed.
// Usage: node tests/e2e/review-flow.mjs [baseUrl]
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
const page = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
page.on('pageerror', (e) => errors.push(e.message));

await page.goto(base + '/login');
await page.getByLabel('Email').fill('buyer.zm@demo.tzed.local');
await page.getByLabel('Password').fill('demo-password');
await page.getByRole('button', { name: 'Sign in' }).click();
await page.getByRole('heading', { name: 'My account' }).waitFor();

await page.goto(base + '/orders?role=buying&status=COMPLETED');
await page.locator('main a[href^="/orders/"]').first().waitFor();
const links = await page
  .locator('main a[href^="/orders/"]')
  .evaluateAll((as) => as.map((a) => a.getAttribute('href')));
let reviewed = false;
for (const href of links) {
  await page.goto(base + href);
  await page.getByRole('heading', { name: /^Order #/ }).waitFor();
  const form = page.getByRole('heading', { name: /How was your experience/ });
  if (!(await form.count())) continue;
  await page.getByRole('radio', { name: '5 stars' }).check({ force: true });
  await page
    .getByLabel('Comment (optional)')
    .fill('Beautiful kitenge, arrived in Lusaka in 4 days. Recommended!');
  await page.getByRole('button', { name: 'Submit review' }).click();
  await page.getByRole('heading', { name: 'Your review' }).waitFor();
  await page.screenshot({ path: out + 'phase7-review-mobile.png', fullPage: true });
  step(`reviewed ${href} with 5 stars`);
  reviewed = true;
  break;
}
if (!reviewed)
  errors.push('no completed order without a review: run tests/e2e/order-flow.mjs first');

await page.goto(base + '/shop/mbeya-kitenge-crafts');
await page.getByRole('heading', { name: 'Reviews' }).waitFor();
await page.getByText('Beautiful kitenge, arrived in Lusaka', { exact: false }).first().waitFor();
await page
  .getByText(/\(\d+ reviews?\)/)
  .first()
  .waitFor();
step('shop page shows the rating and the review');
await page.locator('#reviews').screenshot({ path: out + 'phase7-shop-reviews-mobile.png' });

await page.goto(base + '/search?q=kitenge');
await page
  .getByLabel(/Rated [\d.]+ out of 5 from \d+ reviews/)
  .first()
  .waitFor();
step('search cards show the seller rating');

console.log(errors.length ? 'problems: ' + errors.join('; ') : '✓ no page errors');
if (errors.length) process.exitCode = 1;
await browser.close();
