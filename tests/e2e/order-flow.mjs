// Browser smoke test of ordering, using the dev seed accounts:
// a Zambian buyer orders Tanzanian kitenge (cross-border) → stock goes down → the seller
// accepts and marks it sent → the buyer says they paid → the seller records payment →
// the buyer confirms receipt → the seller completes the order.
// Needs the dev servers running (npm run dev) and the dev seed.
// Usage: node tests/e2e/order-flow.mjs [baseUrl]
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

async function signedIn(email, viewport) {
  const page = await (await browser.newContext({ viewport })).newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(base + '/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill('demo-password');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.getByRole('heading', { name: 'My account' }).waitFor();
  return page;
}

// Buyer (phone)
const buyer = await signedIn('buyer.zm@demo.tzed.local', { width: 390, height: 844 });
await buyer.goto(base + '/search?q=kitenge');
await buyer
  .getByRole('link', { name: /Kitenge fabric/ })
  .first()
  .click();
const box = buyer.getByRole('region', { name: 'Order this item' });
await box.waitFor();
const availableBefore = Number(await buyer.locator('dt:has-text("Available") + dd').textContent());
await box.getByLabel('Quantity').selectOption('2');
await box.getByLabel(/Send to me in Zambia \(cross-border\)/).check();
await box.getByLabel(/I understand that import duty/).check();
await box.getByText(/≈ K [\d,.]+/).waitFor();
await buyer.screenshot({ path: out + 'phase5-buybox-mobile.png', fullPage: true });
await box.getByRole('button', { name: 'Place order' }).click();
await buyer.getByText('Your order has been sent to the seller.', { exact: false }).waitFor();
const orderUrl = buyer.url().replace(/\?.*$/, '');
step(
  `buyer placed ${orderUrl.split('/').pop()} for 2 × kitenge, cross-border (available was ${availableBefore})`,
);

// Seller (desktop)
const seller = await signedIn('joseph@demo.tzed.local', { width: 1280, height: 900 });
await seller.getByRole('button', { name: /Joseph/ }).click();
await seller.getByRole('menuitem', { name: /Orders\s*1/ }).waitFor();
step('seller sees a badge for the new order');
await seller.goto(orderUrl);
await seller.getByRole('button', { name: 'Accept order' }).click();
await seller.getByText('Accepted by the seller').waitFor();
await seller.getByRole('button', { name: 'Mark ready / sent' }).click();
await seller.getByText('Ready for collection / sent').waitFor();
step('seller accepted and marked it sent');

// Buyer says they paid
await buyer.goto(orderUrl);
await buyer.getByRole('button', { name: "I've paid" }).click();
await buyer.getByText('You told the seller you paid', { exact: false }).waitFor();
step('buyer tapped "I\'ve paid"');

// Seller confirms payment
await seller.goto(orderUrl);
await seller.getByText('The buyer says they paid', { exact: false }).waitFor();
await seller.getByRole('button', { name: 'Record payment received' }).click();
await seller.getByText('Payment recorded').waitFor();
step('seller saw the claim and recorded the payment');

// Buyer confirms receipt, seller completes
await buyer.goto(orderUrl);
await buyer.getByRole('button', { name: "I've received it" }).click();
await buyer.getByText('The seller will now complete the order.', { exact: false }).waitFor();
if (await buyer.getByRole('button', { name: 'Mark completed' }).count())
  errors.push('buyer can complete');
step('buyer confirmed receipt (no complete button for the buyer)');
await buyer.screenshot({ path: out + 'phase5-order-buyer-mobile.png', fullPage: true });

await seller.goto(orderUrl);
await seller.getByRole('button', { name: 'Mark completed' }).click();
await seller.getByText('This order is complete.', { exact: true }).waitFor();
step('seller completed the order');
await seller.screenshot({ path: out + 'phase5-order-seller-desktop.png', fullPage: true });

await buyer.goto(orderUrl);
const listingLink = await buyer.getByRole('link', { name: /Kitenge fabric/ }).getAttribute('href');
await buyer.goto(base + listingLink);
const availableAfter = Number(await buyer.locator('dt:has-text("Available") + dd').textContent());
if (availableAfter !== availableBefore - 2)
  errors.push(`stock ${availableBefore} → ${availableAfter}, expected −2`);
else step(`stock went from ${availableBefore} to ${availableAfter}`);

console.log(errors.length ? 'problems: ' + errors.join('; ') : '✓ no page errors');
if (errors.length) process.exitCode = 1;
await browser.close();
