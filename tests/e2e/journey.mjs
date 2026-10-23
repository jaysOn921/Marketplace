// End-to-end journey across the whole marketplace, with brand-new accounts each run:
// a Tanzanian seller registers, confirms their email, opens a shop and lists an item →
// the admin approves it → a Zambian buyer registers, searches with prices in kwacha,
// asks the seller a question and orders cross-border → the seller replies, and the order
// runs to completion → the buyer reviews the seller → the buyer reports the listing →
// the admin removes it → the audit log shows the approval, removal and report decision.
// Needs the dev servers running (npm run dev, no SMTP_URL) and the dev seed (for the admin).
// Usage: node tests/e2e/journey.mjs [baseUrl]
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
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
const outbox = join(out, 'outbox');
const step = (s) => console.log('✓', s);
const errors = [];

const run = Date.now().toString(36);
const title = `Journey kitenge bundle ${run}`;
const shopName = `Journey Shop ${run}`;
const password = 'journey-password-123';
const photo = join(out, 'journey-photo.jpg');
writeFileSync(
  photo,
  await sharp({ create: { width: 1200, height: 900, channels: 3, background: '#b45309' } })
    .jpeg()
    .toBuffer(),
);

const browser = await chromium.launch({ executablePath });
async function newPage(viewport = { width: 1280, height: 900 }) {
  const page = await (await browser.newContext({ viewport })).newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  return page;
}

/** Waits for the newest email to this address in the dev outbox and returns its first link. */
async function linkFromOutbox(email, pattern) {
  for (let i = 0; i < 50; i++) {
    const file = readdirSync(outbox)
      .filter((f) => f.includes(email) && f.endsWith('.txt'))
      .sort()
      .at(-1);
    const match = file && pattern.exec(readFileSync(join(outbox, file), 'utf8'));
    if (match) return match[0];
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`No email for ${email} in ${outbox}`);
}

async function register(page, { country, name, email }) {
  await page.goto(base + '/register');
  await page.getByText(country, { exact: true }).click();
  await page.getByLabel('Full name').fill(name);
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Create account' }).click();
  await page.getByText('Welcome to TZed!').waitFor();
  await page.goto(await linkFromOutbox(email, /http:\/\/\S+verify-email\?token=\S+/));
  await page.getByText('Thanks, your email is confirmed.').waitFor();
}

// ── 1. Tanzanian seller: account, shop, listing ─────────────────────────────
const sellerEmail = `seller.${run}@journey.tzed.local`;
const seller = await newPage({ width: 390, height: 844 });
await register(seller, { country: 'Tanzania', name: 'Rehema Journey', email: sellerEmail });
await seller.goto(base + '/account/seller');
await seller.getByLabel('Shop name').fill(shopName);
await seller.getByLabel('Region').selectOption({ label: 'Mbeya' });
await seller.getByLabel('Town or city').fill('Mbeya');
await seller.getByRole('button', { name: 'Create seller profile' }).click();
await seller.getByText(/Your shop link:/).waitFor();
step('Tanzanian seller registered, confirmed their email and opened a shop (phone)');

await seller.goto(base + '/sell');
await seller.getByLabel('Title').fill(title);
await seller.getByLabel('Category').selectOption({ label: 'Phones & tablets' });
await seller.getByLabel('Condition').selectOption({ label: 'New' });
await seller.getByLabel('Price (TZS)').fill('131,040');
await seller.getByText(/TSh 131,040 ≈ K/).waitFor();
await seller.getByLabel('Quantity available').fill('3');
await seller
  .getByLabel('Description')
  .fill('Three 6-yard kitenge pieces, bright Mbeya prints. Sent by bus via Tunduma.');
await seller.getByLabel(/Also sell to buyers in Zambia/).check();
await seller.getByRole('button', { name: 'Save and add photos' }).click();
await seller.getByText('Draft saved.', { exact: false }).waitFor();
const listingId = /listings\/(\d+)\/edit/.exec(seller.url())[1];
await seller.locator('input[type=file]').setInputFiles(photo);
await seller.getByText('Cover').waitFor();
await seller.getByRole('button', { name: 'Submit for review' }).click();
await seller.getByText('Waiting for review').first().waitFor();
step(`seller listed #${listingId} at TSh 131,040 with a photo and submitted it`);

// ── 2. Admin approves ───────────────────────────────────────────────────────
const admin = await newPage();
await admin.goto(base + '/login');
await admin.getByLabel('Email').fill('admin@tzed.local');
await admin.getByLabel('Password').fill('admin-dev-password');
await admin.getByRole('button', { name: 'Sign in' }).click();
await admin.getByRole('heading', { name: 'My account' }).waitFor();
await admin.goto(base + '/admin/review');
const card = admin.locator('article', { has: admin.getByRole('heading', { name: title }) });
await card.getByRole('button', { name: 'Approve' }).click();
await card.waitFor({ state: 'detached' });
step('admin approved the listing');

// ── 3. Zambian buyer: search in kwacha, ask, order ──────────────────────────
const buyerEmail = `buyer.${run}@journey.tzed.local`;
const buyer = await newPage({ width: 390, height: 844 });
await register(buyer, { country: 'Zambia', name: 'Chanda Journey', email: buyerEmail });
await buyer.goto(`${base}/search?q=${encodeURIComponent(`kitenge bundle ${run}`)}`);
const result = buyer.getByRole('link', { name: new RegExp(title) }).first();
await result.waitFor();
// Zambian buyers see kwacha first; the rate is K 1 = TSh 131.04 or whatever the admin set.
await buyer
  .locator('main')
  .getByText(/K [\d,.]+/)
  .first()
  .waitFor();
await buyer.screenshot({ path: out + 'journey-search-mobile.png', fullPage: true });
step('Zambian buyer found it in search, priced in kwacha');

await result.click();
await buyer.getByRole('button', { name: 'Ask the seller a question' }).click();
await buyer.getByLabel(new RegExp(`Message ${shopName}`)).fill('Can you send it this week?');
await buyer.getByRole('button', { name: 'Send' }).click();
await buyer.getByText('Can you send it this week?').waitFor();
step('buyer asked the seller a question');

await buyer.goto(`${base}/listings/${listingId}`);
const box = buyer.getByRole('region', { name: 'Order this item' });
await box.getByLabel('Send to me in Zambia (cross-border)').check();
await box.getByText(/≈ K [\d,.]+/).waitFor();
await box.getByRole('button', { name: 'Place order' }).click();
await buyer.getByText('Your order has been sent to the seller.', { exact: false }).waitFor();
const orderUrl = buyer.url().replace(/\?.*$/, '');
step(`buyer placed order #${orderUrl.split('/').pop()} (cross-border)`);

// ── 4. Seller replies and runs the order ────────────────────────────────────
await seller.goto(base + '/messages');
await seller.getByText('Can you send it this week?').first().click();
await seller.getByLabel('Write a message').fill('Yes, it goes on Thursday’s bus.');
await seller.getByLabel('Write a message').press('Enter');
await seller.getByText('Yes, it goes on Thursday’s bus.').last().waitFor();
step('seller replied from the inbox');

await seller.goto(orderUrl);
await seller.getByRole('button', { name: 'Accept order' }).click();
await seller.getByText('Accepted by the seller').waitFor();
await seller.getByRole('button', { name: 'Mark ready / sent' }).click();
await seller.getByText('Ready for collection / sent').waitFor();
await buyer.goto(orderUrl);
await buyer.getByRole('button', { name: "I've paid" }).click();
await buyer.getByText('You told the seller you paid', { exact: false }).waitFor();
await seller.goto(orderUrl);
await seller.getByRole('button', { name: 'Record payment received' }).click();
await seller.getByText('Payment recorded').waitFor();
await buyer.goto(orderUrl);
await buyer.getByRole('button', { name: "I've received it" }).click();
await buyer.getByText('The seller will now complete the order.', { exact: false }).waitFor();
await seller.goto(orderUrl);
await seller.getByRole('button', { name: 'Mark completed' }).click();
await seller.getByText('This order is complete.', { exact: true }).waitFor();
step('order accepted → sent → paid → received → completed');

// ── 5. Buyer reviews the seller ─────────────────────────────────────────────
await buyer.goto(orderUrl);
await buyer.getByRole('radio', { name: '4 stars' }).check({ force: true });
await buyer.getByLabel('Comment (optional)').fill('Lovely prints, took 5 days to Lusaka.');
await buyer.getByRole('button', { name: 'Submit review' }).click();
await buyer.getByRole('heading', { name: 'Your review' }).waitFor();
await buyer.goto(`${base}/listings/${listingId}`);
await buyer.getByText('(1 review)').first().waitFor();
step('buyer left a 4-star review, shown on the listing');

// ── 6. Report → admin removes the listing ───────────────────────────────────
await buyer.getByRole('button', { name: 'Report this listing' }).click();
await buyer.getByLabel('Wrong category').check();
await buyer.getByLabel(/Details/).fill('Fabric, not a phone.');
await buyer.getByRole('button', { name: 'Send report' }).click();
await buyer.getByText('Thanks. Our team will review it.', { exact: false }).waitFor();
step('buyer reported the listing');

await admin.goto(base + '/admin/reports');
const report = admin.getByRole('article', { name: title });
await report.getByLabel('Remove the listing').check();
await report.getByLabel(/Note/).fill('Listed in the wrong category; please relist under Fabric.');
await report.getByRole('button', { name: 'Take action' }).click();
await report.waitFor({ state: 'detached' });
step('admin removed the listing from the report');

await buyer.goto(base + '/notifications');
await buyer.getByText('We reviewed it and took action', { exact: false }).first().waitFor();
await seller.goto(base + '/notifications');
await seller.getByText('Listed in the wrong category', { exact: false }).first().waitFor();
step('the buyer and the seller were both told');

// ── 7. Audit log ────────────────────────────────────────────────────────────
await admin.goto(base + '/admin/audit');
for (const action of ['report.resolve', 'listing.remove', 'listing.approve']) {
  await admin.locator('main li', { hasText: action }).first().waitFor();
}
await admin.screenshot({ path: out + 'journey-audit-desktop.png', fullPage: true });
step('audit log shows the approval, the removal and the report decision');

console.log(errors.length ? 'problems: ' + errors.join('; ') : '✓ no page errors');
if (errors.length) process.exitCode = 1;
await browser.close();
