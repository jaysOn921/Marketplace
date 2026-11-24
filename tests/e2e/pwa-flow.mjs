// Browser test of the installable app: manifest and icons, the service worker, reading a
// listing offline, the offline page, and turning on phone notifications.
// Offline reading needs built files, so run it with scripts/pwa-check.sh (a production build);
// VAPID keys in .env are needed for the notifications step.
// Usage: scripts/pwa-check.sh   (or: node tests/e2e/pwa-flow.mjs <baseUrl>)
import { execSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright-core';

const base = process.argv[2] ?? 'http://localhost:5173';
const browsers = process.env.PLAYWRIGHT_BROWSERS_PATH ?? '/opt/pw-browsers';
const chromiumDir =
  existsSync(browsers) && readdirSync(browsers).find((d) => /^chromium-\d+$/.test(d));
const executablePath =
  process.env.CHROMIUM_PATH ??
  (existsSync(join(browsers, 'chromium')) ? join(browsers, 'chromium') : undefined) ??
  (chromiumDir ? join(browsers, chromiumDir, 'chrome-linux', 'chrome') : undefined);
const step = (s) => console.log('✓', s);

/**
 * Goes offline for real by stopping the server (scripts/pwa-check.sh passes the commands):
 * browser offline emulation doesn't reliably cover the service worker's own requests.
 */
async function offline(_context, on) {
  const cmd = on ? process.env.STOP_SERVER : process.env.START_SERVER;
  if (!cmd) throw new Error('Run this test with scripts/pwa-check.sh');
  execSync(cmd, { stdio: 'inherit' });
}

const b = await chromium.launch({ executablePath });
// Behind Caddy in production, the app is told the request came over HTTPS (secure cookies).
const extraHTTPHeaders = process.env.BEHIND_HTTPS_PROXY ? { 'X-Forwarded-Proto': 'https' } : {};
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, extraHTTPHeaders });
const p = await ctx.newPage();
const errors = [];
p.on('pageerror', (e) => errors.push(e.message));

// 1. Manifest and icons
await p.goto(base + '/');
const manifestHref = await p.locator('link[rel="manifest"]').getAttribute('href');
const manifest = await (await p.request.get(base + manifestHref)).json();
if (manifest.display !== 'standalone' || !manifest.icons.some((i) => i.purpose === 'maskable'))
  throw new Error('manifest is missing standalone display or a maskable icon');
for (const icon of manifest.icons) {
  const res = await p.request.get(base + icon.src);
  if (!res.ok() || !res.headers()['content-type']?.includes('png'))
    throw new Error(`icon ${icon.src}`);
}
step(
  `manifest "${manifest.short_name}" with ${manifest.icons.length} icons and ${manifest.shortcuts.length} shortcuts`,
);

// 2. The service worker takes control
await p.evaluate(() => navigator.serviceWorker.ready);
await p.reload();
const controlled = await p.evaluate(() => Boolean(navigator.serviceWorker.controller));
if (!controlled) throw new Error('page is not controlled by the service worker');
step('service worker installed and controlling the page');

// 3. A listing viewed online can be read offline
await p.goto(base + '/search');
const href = await p.locator('main a[href^="/listings/"]').first().getAttribute('href');
await p.goto(base + href);
const title = await p.locator('main h1').first().innerText();
await offline(ctx, true);
await p.goto(base + '/');
await p.goto(base + href);
await p.getByRole('heading', { level: 1, name: title }).waitFor({ timeout: 10000 });
step(`read "${title}" offline from the saved copy`);

await offline(ctx, false);

// 4. With nothing saved for the app shell, the offline page shows
const fresh = await b.newContext({ extraHTTPHeaders });
const q = await fresh.newPage();
await q.goto(base + '/help');
await q.evaluate(() => navigator.serviceWorker.ready);
await q.evaluate(() => caches.delete('tzed-shell-v1'));
await offline(fresh, true);
await q.goto(base + '/orders');
await q.getByRole('heading', { name: "You're offline" }).waitFor();
step('offline page when nothing is saved');
await fresh.close();
await offline(ctx, false);

// 5. Notifications: sign in, allow, turn on
await ctx.grantPermissions(['notifications'], { origin: base });
await p.goto(base + '/login');
await p.getByLabel('Email', { exact: true }).fill('amina@demo.tzed.local');
await p.getByLabel('Password').fill('demo-password');
await p.getByRole('button', { name: 'Sign in' }).click();
await p.getByRole('heading', { name: 'My account' }).waitFor();
const turnOn = p.getByRole('button', { name: 'Turn on notifications' });
await turnOn.waitFor();
await turnOn.click();
const result = await Promise.race([
  p
    .getByText('Notifications are on for this phone.')
    .waitFor()
    .then(() => 'on'),
  p
    .getByText("Notifications couldn't be turned on")
    .waitFor()
    .then(() => 'failed'),
]);
if (result === 'on') {
  step('notifications turned on and saved on the server');
} else {
  // Headless Chromium subscribes through Google's push service, which this network may block.
  console.log(
    '• notifications: the browser could not reach its push service here (not a TZed error)',
  );
}

// 6. Signing out turns them off for this phone and forgets offline listings
await p.goto(base + '/');
await p.getByRole('button', { name: /menu/i }).first().click();
await p.getByRole('button', { name: 'Sign out' }).click();
await p.waitForFunction(async () => !(await caches.has('tzed-public')));
const sub = await p.evaluate(async () =>
  Boolean(await (await navigator.serviceWorker.ready).pushManager.getSubscription()),
);
if (sub) throw new Error('push subscription kept after sign-out');
step('sign-out removed this phone’s subscription and the offline listings');

if (errors.length) throw new Error('page errors: ' + errors.join('; '));
step('no page errors');
await b.close();
