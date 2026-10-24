// Browser smoke test of the account flow: register (ZM) → verify email via the dev
// outbox → seller profile → sign out (mobile menu) → wrong/right password sign-in.
// Needs the dev servers running (npm run dev) with no SMTP_URL set.
// Usage: node tests/e2e/auth-flow.mjs [baseUrl]
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
const email = `e2e.${Date.now()}@example.com`;
const b = await chromium.launch({ executablePath });
const p = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
const errors = [];
p.on('pageerror', (e) => errors.push(e.message));
const step = (s) => console.log('✓', s);

await p.goto(base + '/register');
await p.getByText('Zambia', { exact: true }).click();
await p.getByLabel('Full name').fill('Mwila E2E');
await p.getByLabel('Email').fill(email);
await p.getByLabel('Phone number (optional)').fill('0977 123 456');
await p.getByLabel('Password').fill('e2e-password-123');
await p.getByRole('checkbox').check();
await p.getByRole('button', { name: 'Create account' }).click();
await p.getByText('Welcome to TZed!').waitFor();
step('registered and landed on account page with welcome + verify banner');
await p.screenshot({ path: 'tests/artifacts/phase2-account-mobile.png', fullPage: true });

await p.waitForTimeout(300);
const dir = 'tests/artifacts/outbox/';
const file = readdirSync(dir).find((f) => f.includes(email) && f.endsWith('.txt'));
const link = /http:\/\/\S+verify-email\?token=\S+/.exec(readFileSync(dir + file, 'utf8'))[0];
await p.goto(link);
await p.getByText('Thanks, your email is confirmed.').waitFor();
step('verified email via outbox link');

await p.goto(base + '/account/seller');
await p.getByLabel('Shop name').fill('Mwila E2E Shop');
await p.getByLabel('Province').selectOption({ label: 'Lusaka' });
await p.getByLabel('Town or city').fill('Lusaka');
await p.getByRole('button', { name: 'Create seller profile' }).click();
await p.getByText(/Your shop link: \/shop\/mwila-e2e-shop/).waitFor();
step('created seller profile');

await p.getByRole('button', { name: 'Menu' }).click();
await p.getByRole('button', { name: 'Sign out' }).click();

await p
  .getByRole('heading', { name: 'Buy and sell across Tanzania and Zambia' })
  .waitFor();
step('signed out from the mobile menu, back on the home page');

await p.goto(base + '/login');
await p.getByLabel('Email').fill(email);
await p.getByLabel('Password').fill('wrong-password');
await p.getByRole('button', { name: 'Sign in' }).click();
await p.getByText('Email or password is incorrect.').waitFor();
await p.getByLabel('Password').fill('e2e-password-123');
await p.getByRole('button', { name: 'Sign in' }).click();
await p.getByRole('heading', { name: 'My account' }).waitFor();
step('wrong password rejected, correct password signs in');

await p.setViewportSize({ width: 1280, height: 900 });
await p.goto(base + '/account');
await p.screenshot({ path: 'tests/artifacts/phase2-account-desktop.png', fullPage: true });
console.log(errors.length ? 'page errors: ' + errors.join('; ') : '✓ no page errors');
if (errors.length) process.exitCode = 1;
await b.close();
