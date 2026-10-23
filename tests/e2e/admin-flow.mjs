// Browser smoke test of the admin area, using the dev seed admin. Keeps demo data intact:
// dashboard → re-save the current exchange rate (adds history + audit entry) → reply to an
// open support ticket (run support-flow.mjs first) → search users and listings → audit log
// shows the actions → admin menu on a phone.
// Needs the dev servers running (npm run dev) and the dev seed.
// Usage: node tests/e2e/admin-flow.mjs [baseUrl]
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
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const p = await context.newPage();
p.on('pageerror', (e) => errors.push(e.message));

await p.goto(base + '/login');
await p.getByLabel('Email').fill('admin@tzed.local');
await p.getByLabel('Password').fill('admin-dev-password');
await p.getByRole('button', { name: 'Sign in' }).click();
await p.getByRole('heading', { name: 'My account' }).waitFor();

await p.goto(base + '/admin');
await p.getByRole('heading', { name: 'Dashboard' }).waitFor();
await p.getByText('Users by country').waitFor();
step('dashboard loaded');
await p.screenshot({ path: out + 'phase9-dashboard-desktop.png', fullPage: true });

// Exchange rate: save the current value again (no price change), with a note.
await p
  .getByRole('navigation', { name: 'Admin' })
  .getByRole('link', { name: 'Exchange rate' })
  .click();
const current = (
  await p
    .getByText(/^K 1 = TSh [\d.,]+$/)
    .first()
    .textContent()
)
  .replace(/[^\d.]/g, '')
  .replace(/^1/, '');
await p.getByLabel('How many shillings one kwacha buys').fill(current);
await p.getByLabel('Note').fill('E2E check: rate confirmed unchanged');
await p.getByRole('button', { name: 'Save rate' }).click();
await p.getByText('Rate saved.', { exact: false }).waitFor();
await p.getByRole('cell', { name: 'E2E check: rate confirmed unchanged' }).first().waitFor();
step(`re-saved the rate (K 1 = TSh ${current}); it appears in the history`);
await p.screenshot({ path: out + 'phase9-rates-desktop.png', fullPage: true });

// Support: reply to the newest open ticket
await p.goto(base + '/admin/tickets?status=OPEN');
const ticket = p.locator('main a[href^="/admin/tickets/"]').first();
await Promise.race([ticket.waitFor(), p.getByText('Nothing here.').waitFor()]);
if (await ticket.count()) {
  await ticket.click();
  await p
    .getByLabel('Reply as TZed support')
    .fill(
      'Thanks for your message. Many sellers in Mbeya and Dar es Salaam send to Zambia by bus.',
    );
  await p.getByRole('button', { name: 'Send reply' }).click();
  await p.getByText('Many sellers in Mbeya and Dar es Salaam', { exact: false }).first().waitFor();
  step('replied to an open support ticket');
} else {
  console.log('  (no open tickets: run tests/e2e/support-flow.mjs first to test replies)');
}

// Users and listings
await p.goto(base + '/admin/users');
await p.getByRole('searchbox', { name: 'Name, email or shop' }).fill('amina');
await p.getByRole('searchbox', { name: 'Name, email or shop' }).press('Enter');
await p.getByText('amina@demo.tzed.local').waitFor();
step('found a seller in the users list');
await p.goto(base + '/admin/listings?status=PENDING_REVIEW');
await p.getByRole('heading', { name: 'Listings' }).waitFor();
step('listings filter by status works');

// Audit log shows what we did
await p.goto(base + '/admin/audit');
await p.locator('main li', { hasText: 'fx.update' }).first().waitFor();
step('audit log shows the rate change');
await p.screenshot({ path: out + 'phase9-audit-desktop.png', fullPage: true });

// Phone: admin menu strip
await p.setViewportSize({ width: 390, height: 844 });
await p.goto(base + '/admin');
await p.getByRole('navigation', { name: 'Admin' }).waitFor();
if (await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth))
  errors.push('mobile overflow on admin');
await p.screenshot({ path: out + 'phase9-dashboard-mobile.png', fullPage: true });
step('admin dashboard fits a phone screen');

console.log(errors.length ? 'problems: ' + errors.join('; ') : '✓ no page errors');
if (errors.length) process.exitCode = 1;
await browser.close();
