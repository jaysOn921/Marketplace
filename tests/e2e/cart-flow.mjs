// Browser smoke test of the cart and analytics, using the dev seed accounts:
// a Zambian buyer adds Tanzanian kitenge (×2) and a Lusaka sofa to the cart → the header
// shows the count → the cart has one section per seller → one checkout places two orders →
// the kitenge seller sees views and orders in Shop analytics → the admin opens Analytics.
// The buyer then cancels both orders, so the demo stock is back as it was.
// Needs the dev servers running (npm run dev) and the dev seed.
// Usage: node tests/e2e/cart-flow.mjs [baseUrl]
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
// TZed doesn't count listing views from headless browsers (usually scrapers), so present
// the same identity as a normal Chrome on Android.
const UA = (await browser.version()).replace(
  /^(\d+).*$/,
  'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/$1.0.0.0 Mobile Safari/537.36',
);

async function signedIn(email, password, viewport) {
  const page = await (await browser.newContext({ viewport, userAgent: UA })).newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(base + '/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.getByRole('heading', { name: 'My account' }).waitFor();
  return page;
}

async function addFromSearch(page, query, title, quantity) {
  await page.goto(`${base}/search?q=${encodeURIComponent(query)}`);
  await page.getByRole('link', { name: title }).first().click();
  const box = page.getByRole('region', { name: 'Order this item' });
  await box.waitFor();
  const available = Number(await page.locator('dt:has-text("Available") + dd').textContent());
  if (quantity > 1) await box.getByLabel('Quantity').selectOption(String(quantity));
  await box.getByRole('button', { name: 'Add to cart' }).click();
  await box.getByText(`Added ${quantity} to your cart.`).waitFor();
  return { url: page.url(), available };
}

// ── Buyer fills the cart (phone) ────────────────────────────────────────────
const buyer = await signedIn('buyer.zm@demo.tzed.local', 'demo-password', {
  width: 390,
  height: 844,
});
const kitenge = await addFromSearch(buyer, 'kitenge', /Kitenge fabric, 6 yards/, 2);
const sofa = await addFromSearch(buyer, 'sofa', /3-seater fabric sofa/, 1);
await buyer.getByRole('link', { name: 'Cart, 3 items' }).waitFor();
step('buyer added kitenge ×2 and a sofa; the header shows “Cart, 3 items”');

// ── Cart and checkout ───────────────────────────────────────────────────────
await buyer.getByRole('link', { name: 'Cart, 3 items' }).click();
await buyer.getByRole('heading', { name: 'Your cart' }).waitFor();
const tz = buyer.getByRole('region', { name: /Mbeya Kitenge/ });
const zm = buyer.getByRole('region', { name: /Mwila Home/ });
await tz.getByText(/≈ K [\d,.]+/).waitFor();
await buyer.getByRole('button', { name: 'Place 2 orders' }).click();
await tz.getByText('Choose how you want to get these items.').waitFor();
await tz.getByLabel('Send to me in Zambia (cross-border)').check();
await tz.getByLabel('Note to the seller (optional)').fill('Bus to Lusaka please');
await zm.getByLabel('Local delivery by the seller').check();
await buyer.screenshot({ path: out + 'cart-mobile.png', fullPage: true });
if (await buyer.evaluate(() => document.documentElement.scrollWidth > window.innerWidth))
  errors.push('cart scrolls sideways on a phone');
await buyer.getByRole('button', { name: 'Place 2 orders' }).click();
await buyer.getByText('Your 2 orders have been sent to the sellers.', { exact: false }).waitFor();
await buyer.getByRole('link', { name: 'Cart' }).waitFor(); // no count any more
const orderLinks = await buyer
  .locator('main a[href^="/orders/"]')
  .evaluateAll((as) => as.slice(0, 2).map((a) => a.getAttribute('href')));
step(`one checkout placed two orders (${orderLinks.join(', ')}); the cart is empty`);

// ── Seller analytics (desktop) ──────────────────────────────────────────────
const seller = await signedIn('joseph@demo.tzed.local', 'demo-password', {
  width: 1280,
  height: 900,
});
await seller.getByRole('button', { name: /Joseph/ }).click();
await seller.getByRole('menuitem', { name: 'Shop analytics' }).click();
await seller.getByRole('heading', { name: 'Shop analytics' }).waitFor();
const row = seller.locator('tr', { has: seller.getByRole('link', { name: /Kitenge fabric/ }) });
await row.waitFor();
const cells = await row.locator('td').allTextContents();
if (Number(cells[1]) < 1 || Number(cells[2]) < 1 || Number(cells[3]) < 1)
  errors.push(`kitenge row should show a view, a cart add and an order: ${cells.join(' | ')}`);
await seller.getByRole('button', { name: '7 days' }).click();
await seller.getByRole('button', { name: '7 days', pressed: true }).waitFor();
await seller.screenshot({ path: out + 'shop-analytics-desktop.png', fullPage: true });
step(
  `seller sees the listing in Shop analytics (views ${cells[1]}, cart ${cells[2]}, orders ${cells[3]})`,
);

// ── Admin analytics ─────────────────────────────────────────────────────────
const admin = await signedIn('admin@tzed.local', 'admin-dev-password', {
  width: 1280,
  height: 900,
});
await admin.goto(base + '/admin/analytics');
await admin.getByRole('heading', { name: 'Analytics' }).waitFor();
await admin.getByText('Orders placed').first().waitFor();
await admin.getByText(/orders crossed the border/).waitFor();
const chart = admin.locator('figure', { hasText: 'Orders placed' });
await chart.getByRole('button', { name: 'Show as table' }).click();
await chart.getByRole('table').waitFor();
await admin.screenshot({ path: out + 'admin-analytics-desktop.png', fullPage: true });
await admin.setViewportSize({ width: 390, height: 844 });
await admin.goto(base + '/admin/analytics');
await admin.getByText(/orders crossed the border/).waitFor();
if (await admin.evaluate(() => document.documentElement.scrollWidth > window.innerWidth))
  errors.push('admin analytics scrolls sideways on a phone');
await admin.screenshot({ path: out + 'admin-analytics-mobile.png', fullPage: true });
step('admin analytics loads with figures, charts and a table view, on desktop and phone');

// ── Clean up: the buyer cancels both orders ─────────────────────────────────
for (const href of orderLinks) {
  await buyer.goto(base + href);
  await buyer.getByRole('button', { name: 'Cancel order' }).click();
  await buyer.getByLabel(/Reason for cancelling/).fill('E2E test: cancelling to restore demo data');
  // Wait for the server to confirm, not just for the page to change.
  await Promise.all([
    buyer.waitForResponse((r) => r.url().endsWith(`/api/v1${href}/cancel`) && r.ok()),
    buyer.locator('form').getByRole('button', { name: 'Cancel order' }).click(),
  ]);
}
for (const [name, item] of [
  ['kitenge', kitenge],
  ['sofa', sofa],
]) {
  await buyer.goto(item.url);
  const now = Number(await buyer.locator('dt:has-text("Available") + dd').textContent());
  if (now !== item.available) errors.push(`${name} stock ${now}, expected ${item.available}`);
}
step('buyer cancelled both orders; stock is back as it was');

console.log(errors.length ? 'problems: ' + errors.join('; ') : '✓ no page errors');
if (errors.length) process.exitCode = 1;
await browser.close();
