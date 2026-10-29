// Browser test of two-step sign-in: register → turn it on with the key shown on the account
// page → backup codes → sign in again with a code from the "app" (computed here) → a used
// backup code is refused. Needs the dev servers running (npm run dev).
// Usage: node tests/e2e/two-step-flow.mjs [baseUrl]
import { createHmac } from 'node:crypto';
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
const email = `e2e.twostep.${Date.now()}@example.com`;
const password = 'e2e-password-123';
const step = (s) => console.log('✓', s);

/** What an authenticator app shows: RFC 6238, 30-second steps, 6 digits. */
function totp(key, offsetSteps = 0) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const ch of key.replace(/\s/g, ''))
    bits += alphabet.indexOf(ch).toString(2).padStart(5, '0');
  const bytes = Buffer.from(bits.match(/.{8}/g).map((b) => parseInt(b, 2)));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000) + offsetSteps));
  const h = createHmac('sha1', bytes).update(counter).digest();
  const o = h[h.length - 1] & 0xf;
  return String((h.readUInt32BE(o) & 0x7fffffff) % 1e6).padStart(6, '0');
}

const b = await chromium.launch({ executablePath });
const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
const p = await ctx.newPage();
const errors = [];
p.on('pageerror', (e) => errors.push(e.message));

await p.goto(base + '/register');
await p.getByText('Tanzania', { exact: true }).click();
await p.getByLabel('Full name').fill('Two Step E2E');
await p.getByLabel('Email', { exact: true }).fill(email);
await p.getByLabel('Password').fill(password);
await p.getByLabel(/I agree to the/).check();
await p.getByLabel('I am 18 or older.').check();
await p.getByRole('button', { name: 'Create account' }).click();
await p.getByText('Welcome to TZed!').waitFor();
step('registered');

await p.getByRole('button', { name: 'Turn on two-step sign-in' }).click();
await p.getByRole('img', { name: /QR code/ }).waitFor();
const key = await p.locator('#two-step code').innerText();
await p.getByLabel('Enter the 6-digit code the app shows').fill(totp(key));
await p.getByRole('button', { name: 'Turn on', exact: true }).click();
const codes = (await p.getByRole('list', { name: 'Backup codes' }).innerText()).split(/\s+/);
if (codes.length !== 10) throw new Error(`expected 10 backup codes, got ${codes.length}`);
await p.getByRole('button', { name: "I've saved them" }).click();
await p.getByText('Two-step sign-in is on.').waitFor();
step('turned on with the QR key, got 10 backup codes');

async function signInWith(code) {
  await ctx.clearCookies();
  await p.goto(base + '/login');
  await p.getByLabel('Email', { exact: true }).fill(email);
  await p.getByLabel('Password').fill(password);
  await p.getByRole('button', { name: 'Sign in' }).click();
  await p.getByRole('heading', { name: 'Enter your code' }).waitFor();
  await p.getByLabel('Code').fill(code);
  await p.getByRole('button', { name: 'Sign in' }).click();
}

// The next step's code: the current one was just used to turn it on.
await signInWith(totp(key, 1));
await p.getByRole('heading', { name: 'My account' }).waitFor();
step('signed in again with password + authenticator code');

await signInWith(codes[0]);
await p.getByRole('heading', { name: 'My account' }).waitFor();
await signInWith(codes[0]);
await p.getByText(/That code is not right/).waitFor();
step('a backup code works once');

if (errors.length) throw new Error('page errors: ' + errors.join('; '));
step('no page errors');
await b.close();
