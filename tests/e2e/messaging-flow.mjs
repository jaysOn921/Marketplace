// Browser smoke test of messages and notifications, using the dev seed accounts:
// a buyer asks a Lusaka seller about the sofa → the seller sees the badges, opens the
// inbox and replies → the buyer sees the reply (polling) and the notification bell.
// Needs the dev servers running (npm run dev) and the dev seed.
// Usage: node tests/e2e/messaging-flow.mjs [baseUrl]
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
const question = `Is the sofa still available? (${Date.now().toString().slice(-4)})`;

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

const buyer = await signedIn('buyer.zm@demo.tzed.local', { width: 390, height: 844 });
await buyer.goto(base + '/search?q=sofa');
await buyer
  .getByRole('link', { name: /3-seater fabric sofa/ })
  .first()
  .click();
await buyer.getByRole('button', { name: 'Ask the seller a question' }).click();
await buyer.getByLabel(/Message Mwila Home Store/).fill(question);
await buyer.getByRole('button', { name: 'Send' }).click();
await buyer.getByText(question).waitFor();
step('buyer asked a question from the listing page (mobile)');

const seller = await signedIn('mwila@demo.tzed.local', { width: 1280, height: 900 });
await seller.getByRole('link', { name: /Messages, \d+ unread/ }).waitFor({ timeout: 35_000 });
await seller.getByRole('button', { name: /Notifications, \d+ unread/ }).click();
await seller
  .getByRole('dialog', { name: 'Notifications' })
  .getByText(/New message from Natasha Phiri/)
  .first()
  .click();
await seller.getByText(question).last().waitFor();
step('seller saw both badges and opened the message from the bell');
await seller.getByLabel('Write a message').fill('Yes! I can deliver in Lusaka this week.');
await seller.getByLabel('Write a message').press('Enter');
await seller.getByText('Yes! I can deliver in Lusaka this week.').last().waitFor();
await seller.screenshot({ path: out + 'phase6-messages-desktop.png', fullPage: true });
step('seller replied with Enter');

await buyer
  .getByText('Yes! I can deliver in Lusaka this week.')
  .last()
  .waitFor({ timeout: 10_000 });
step('buyer received the reply without reloading');
await buyer.screenshot({ path: out + 'phase6-thread-mobile.png' });
await buyer.goto(base + '/messages');
await buyer.screenshot({ path: out + 'phase6-inbox-mobile.png' });

console.log(errors.length ? 'problems: ' + errors.join('; ') : '✓ no page errors');
if (errors.length) process.exitCode = 1;
await browser.close();
