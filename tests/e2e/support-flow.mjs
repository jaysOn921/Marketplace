// Browser smoke test of help, support and reports, using the dev seed:
// a guest searches help, opens a ticket and follows the private link from the dev outbox;
// a buyer reports a listing; the admin dismisses it (so demo data stays) and the buyer is
// told the outcome.
// Needs the dev servers running (npm run dev, no SMTP_URL) and the dev seed.
// Usage: node tests/e2e/support-flow.mjs [baseUrl]
import { existsSync, readdirSync, readFileSync } from 'node:fs';
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
const guestEmail = `guest.${Date.now()}@example.com`;

async function page(viewport, email, password = 'demo-password') {
  const p = await (await browser.newContext({ viewport })).newPage();
  p.on('pageerror', (e) => errors.push(e.message));
  if (email) {
    await p.goto(base + '/login');
    await p.getByLabel('Email').fill(email);
    await p.getByLabel('Password').fill(password);
    await p.getByRole('button', { name: 'Sign in' }).click();
    await p.getByRole('heading', { name: 'My account' }).waitFor();
  }
  return p;
}

// Guest: help search + ticket
const guest = await page({ width: 390, height: 844 });
await guest.goto(base + '/help');
await guest.getByRole('searchbox', { name: 'Search help articles' }).fill('customs');
await guest.getByRole('searchbox', { name: 'Search help articles' }).press('Enter');
await guest.getByRole('link', { name: /Buying from the other country/ }).click();
await guest.getByText('TZed does not handle customs', { exact: false }).waitFor();
step('guest found the customs article by searching help');
await guest.screenshot({ path: out + 'phase8-help-article-mobile.png', fullPage: true });

await guest.goto(base + '/help/contact');
await guest.getByLabel('Full name').fill('Juma Guest');
await guest.getByLabel('Email').fill(guestEmail);
await guest.getByLabel('Subject').fill('Question about delivery to Ndola');
await guest
  .getByLabel('Message')
  .fill('Do sellers in Dar es Salaam send to Ndola, and how long does it take?');
await guest.getByRole('button', { name: 'Send message' }).click();
await guest.getByText(/Your ticket number is #\d+/).waitFor();
await guest.waitForTimeout(300);
const mail = readdirSync('tests/artifacts/outbox').find(
  (f) => f.includes(guestEmail) && f.endsWith('.txt'),
);
const link = /http:\/\/\S+\/support\/tickets\/\d+\?token=\S+/.exec(
  readFileSync(`tests/artifacts/outbox/${mail}`, 'utf8'),
)[0];
await guest.goto(link);
await guest.getByRole('heading', { name: /Question about delivery to Ndola/ }).waitFor();
await guest.getByLabel('Reply').fill('Also: can I pay by Airtel Money?');
await guest.getByRole('button', { name: 'Send reply' }).click();
await guest.getByText('Also: can I pay by Airtel Money?').waitFor();
step('guest opened a ticket, followed the emailed private link and replied');

// Buyer reports a listing
const buyer = await page({ width: 1280, height: 900 }, 'buyer.zm@demo.tzed.local');
await buyer.goto(base + '/search?q=bluetooth+speaker');
await buyer
  .getByRole('link', { name: /Bluetooth speaker/ })
  .first()
  .click();
// Wait for the listing page itself (navigation keeps the old page briefly during the transition).
const reportButton = buyer.getByRole('button', { name: 'Report this listing' });
await reportButton.waitFor();
const title = await buyer.getByRole('heading', { level: 1 }).textContent();
await reportButton.click();
await buyer.getByLabel('Wrong category').check();
await buyer.getByLabel(/Details/).fill('Looks like it should be under TV, audio & video.');
await buyer.getByRole('button', { name: 'Send report' }).click();
// (If an earlier run already reported it, the open report is still there for the admin.)
await buyer.getByText(/Thanks\. Our team will review it\.|already reported this/).waitFor();
step(`buyer reported “${title}”`);

// Admin dismisses
const admin = await page({ width: 1280, height: 900 }, 'admin@tzed.local', 'admin-dev-password');
await admin.goto(base + '/admin/reports');
const card = admin.getByRole('article', { name: title });
await card.waitFor();
await admin.screenshot({ path: out + 'phase8-admin-reports-desktop.png', fullPage: true });
await card.getByLabel(/Note/).fill('Accessories is a reasonable category for a speaker.');
await card.getByRole('button', { name: 'Dismiss' }).click();
await card.waitFor({ state: 'detached' });
step('admin dismissed the report with a note');

await buyer.goto(base + '/notifications');
await buyer
  .getByText("We reviewed it and didn't find a breach", { exact: false })
  .first()
  .waitFor();
step('buyer was told the outcome');

console.log(errors.length ? 'problems: ' + errors.join('; ') : '✓ no page errors');
if (errors.length) process.exitCode = 1;
await browser.close();
