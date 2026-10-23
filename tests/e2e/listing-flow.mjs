// Browser smoke test of the listing + approval flow, using the seeded demo accounts:
// Tanzanian seller lists an item with a photo → submits → admin rejects with a reason →
// seller fixes and resubmits → admin approves → a guest sees it live, priced in TSh and ≈ K.
// Needs the dev servers running (npm run dev) and the dev seed (npm run db:seed -w @tzed/api).
// Usage: node tests/e2e/listing-flow.mjs [baseUrl]
import { existsSync, readdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { chromium } from 'playwright-core';
// sharp is a dependency of the API package.
const sharp = createRequire(new URL('../../apps/api/package.json', import.meta.url))('sharp');

const base = process.argv[2] ?? 'http://localhost:5173';
const browsers = process.env.PLAYWRIGHT_BROWSERS_PATH ?? '/opt/pw-browsers';
const chromiumDir =
  existsSync(browsers) && readdirSync(browsers).find((d) => /^chromium-\d+$/.test(d));
const executablePath =
  process.env.CHROMIUM_PATH ??
  (chromiumDir ? join(browsers, chromiumDir, 'chrome-linux', 'chrome') : undefined);
const out = 'tests/artifacts/';
const step = (s) => console.log('✓', s);
const title = `E2E Nokia 105 phone ${Date.now().toString().slice(-5)}`;

const photo = join(out, 'e2e-photo.jpg');
writeFileSync(
  photo,
  await sharp({ create: { width: 1200, height: 900, channels: 3, background: '#0e7490' } })
    .jpeg()
    .toBuffer(),
);

const browser = await chromium.launch({ executablePath });
const errors = [];
async function session(email, password, viewport = { width: 1280, height: 900 }) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1 });
  const page = await context.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  if (email) {
    await page.goto(base + '/login');
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password').fill(password);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await page.getByRole('heading', { name: 'My account' }).waitFor();
  }
  return page;
}

// Seller
const seller = await session('amina@demo.tzed.local', 'demo-password', { width: 390, height: 844 });
await seller.goto(base + '/sell');
await seller.getByRole('heading', { name: 'List an item' }).waitFor();
await seller.getByLabel('Title').fill(title);
await seller.getByLabel('Category').selectOption({ label: 'Phones & tablets' });
await seller.getByLabel('Condition').selectOption({ label: 'Like new' });
await seller.getByLabel('Price (TZS)').fill('55,000');
await seller.getByText(/TSh 55,000 ≈ K/).waitFor();
await seller
  .getByLabel('Description')
  .fill('Classic Nokia 105, long battery life, dual SIM. Charger included.');
await seller.getByLabel(/Also sell to buyers in Zambia/).check();
await seller.getByLabel('Delivery notes (optional)').fill('Bus to Lusaka via Tunduma, 4 days.');
await seller.getByRole('button', { name: 'Save and add photos' }).click();
await seller.getByText('Draft saved.', { exact: false }).waitFor();
const id = /listings\/(\d+)\/edit/.exec(seller.url())[1];
step(`seller created draft #${id} (mobile)`);

await seller.locator('input[type=file]').setInputFiles(photo);
await seller.getByText('Cover').waitFor();
await seller.getByRole('button', { name: 'Submit for review' }).click();
await seller.getByText('Waiting for review').first().waitFor();
step('uploaded a photo and submitted for review');
await seller.screenshot({ path: out + 'phase3-edit-mobile.png', fullPage: true });

// Admin rejects
const admin = await session('admin@tzed.local', 'admin-dev-password');
await admin.goto(base + '/admin/review');
const card = admin.locator('article', { has: admin.getByRole('heading', { name: title }) });
await card.waitFor();
await admin.screenshot({ path: out + 'phase3-review-queue-desktop.png', fullPage: true });
await card.getByRole('button', { name: 'Reject…' }).click();
await card.getByRole('button', { name: 'Missing details' }).click();
await card.getByRole('button', { name: 'Reject listing' }).click();
await card.waitFor({ state: 'detached' });
step('admin rejected with a reason');

// Seller sees reason, edits, resubmits
await seller.goto(`${base}/listings/${id}/edit`);
await seller.getByText('Please add more details', { exact: false }).waitFor();
await seller
  .getByLabel('Description')
  .fill(
    'Classic Nokia 105 (2023), like new, long battery life, dual SIM. Box and charger included.',
  );
await seller.getByRole('button', { name: 'Save changes' }).click();
await seller.getByText('Saved.').waitFor();
await seller.getByRole('button', { name: 'Resubmit for review' }).click();
await seller.getByText('Waiting for review').first().waitFor();
step('seller saw the reason, fixed it and resubmitted');

// Admin approves
await admin.goto(base + '/admin/review');
await card.getByRole('button', { name: 'Approve' }).click();
await card.waitFor({ state: 'detached' });
step('admin approved');

// Guest sees it live
const guest = await session();
await guest.goto(`${base}/listings/${id}`);
await guest.getByRole('heading', { level: 1, name: title }).waitFor();
await guest.getByText('TSh 55,000').waitFor();
await guest
  .getByText(/≈ K [\d,.]+/)
  .first()
  .waitFor();
await guest.getByText('Available to buyers in Tanzania and Zambia').waitFor();
step('guest sees the live listing with TSh price, ≈ K and cross-border notice');
await guest.screenshot({ path: out + 'phase3-listing-desktop.png', fullPage: true });
const guestMobile = await session(undefined, undefined, { width: 390, height: 844 });
await guestMobile.goto(`${base}/listings/${id}`);
await guestMobile.getByRole('heading', { level: 1, name: title }).waitFor();
await guestMobile.screenshot({ path: out + 'phase3-listing-mobile.png', fullPage: true });

console.log(errors.length ? 'page errors: ' + errors.join('; ') : '✓ no page errors');
if (errors.length) process.exitCode = 1;
await browser.close();
