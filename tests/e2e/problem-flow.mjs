// Browser smoke test of "Problem with this order", using the dev seed accounts:
// the Zambian buyer reports a problem on one of their orders → the admin sees it in
// Admin → Problems, replies and resolves it → the buyer sees the reply and the decision.
// Ends with the problem resolved, so the demo data stays tidy.
// Needs the dev servers running (npm run dev) and at least one order by the demo buyer
// (run tests/e2e/order-flow.mjs first).
// Usage: node tests/e2e/problem-flow.mjs [baseUrl]
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
const stamp = Date.now().toString(36);

async function signedIn(email, password, viewport) {
  const page = await (await browser.newContext({ viewport })).newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(base + '/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.getByRole('heading', { name: 'My account' }).waitFor();
  return page;
}

// Buyer (phone) reports a problem on an order with none open.
const buyer = await signedIn('buyer.zm@demo.tzed.local', 'demo-password', {
  width: 390,
  height: 844,
});
await buyer.goto(base + '/orders?role=buying');
await buyer.locator('main a[href^="/orders/"]').first().waitFor();
const links = await buyer
  .locator('main a[href^="/orders/"]')
  .evaluateAll((as) => as.map((a) => a.getAttribute('href')));
let orderUrl = null;
for (const href of links) {
  await buyer.goto(base + href);
  await buyer.getByRole('heading', { name: /^Order #/ }).waitFor();
  if (await buyer.getByRole('button', { name: /^Report (a|another) problem$/ }).count()) {
    orderUrl = base + href;
    break;
  }
}
if (!orderUrl) throw new Error('No order without an open problem: run order-flow.mjs first');
await buyer.getByRole('button', { name: /^Report (a|another) problem$/ }).click();
await buyer.getByLabel('Not as described').check();
await buyer.getByLabel('What happened?').fill(`E2E ${stamp}: the colours differ from the photos.`);
await buyer.getByRole('button', { name: 'Send to TZed' }).click();
await buyer.getByRole('heading', { name: 'Problem with this order', exact: true }).waitFor();
await buyer.getByText(`E2E ${stamp}: the colours differ from the photos.`).waitFor();
await buyer.locator('#problem').screenshot({ path: out + 'problem-order-mobile.png' });
step(`buyer reported a problem on ${orderUrl.split('/').pop()}`);

// Admin replies and resolves.
const admin = await signedIn('admin@tzed.local', 'admin-dev-password', {
  width: 1280,
  height: 900,
});
await admin.goto(base + '/admin/disputes');
await admin.getByRole('link', { name: /Problems\s*\d+/ }).waitFor();
await admin
  .getByRole('link', { name: /Not as described/ })
  .first()
  .click();
await admin.getByText(`E2E ${stamp}: the colours differ from the photos.`).waitFor();
await admin.getByLabel('Add a message').fill('Thanks. Could you send a photo of the fabric?');
await admin.getByRole('button', { name: 'Send', exact: true }).click();
await admin.getByText('Thanks. Could you send a photo of the fabric?').waitFor();
await admin
  .getByLabel('Outcome (shown to both sides)')
  .fill('E2E: the seller agreed to exchange the fabric.');
await admin.getByRole('button', { name: 'Resolve problem' }).click();
await admin.getByText('TZed’s decision').waitFor();
await admin.screenshot({ path: out + 'problem-admin-desktop.png', fullPage: true });
step('admin replied and resolved it');

// Buyer sees the reply and the decision.
await buyer.goto(orderUrl);
await buyer.getByText('Thanks. Could you send a photo of the fabric?').waitFor();
await buyer.getByText('E2E: the seller agreed to exchange the fabric.').first().waitFor();
await buyer.getByText('Problem resolved by TZed', { exact: false }).first().waitFor();
step('buyer sees TZed’s reply, the decision, and it in the order timeline');

console.log(errors.length ? 'problems: ' + errors.join('; ') : '✓ no page errors');
if (errors.length) process.exitCode = 1;
await browser.close();
