// Accessibility and mobile layout check: runs axe-core (WCAG 2.1 A/AA rules) on the main
// pages as a guest, a buyer, a seller and the admin, on a phone and a desktop screen, and
// checks that no page scrolls sideways on a phone. Writes tests/artifacts/a11y-report.json.
// Fails on "serious" or "critical" findings; lists "minor" and "moderate" ones.
// Needs the dev servers running (npm run dev) and the dev seed.
// Usage: node tests/e2e/a11y.mjs [baseUrl]
//        TZED_LANG=sw node tests/e2e/a11y.mjs   (the same checks with the site in Swahili)
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { chromium } from 'playwright-core';

const base = process.argv[2] ?? 'http://localhost:5173';
const browsers = process.env.PLAYWRIGHT_BROWSERS_PATH ?? '/opt/pw-browsers';
const chromiumDir =
  existsSync(browsers) && readdirSync(browsers).find((d) => /^chromium-\d+$/.test(d));
const executablePath =
  process.env.CHROMIUM_PATH ??
  (chromiumDir ? join(browsers, chromiumDir, 'chrome-linux', 'chrome') : undefined);
const axeSource = readFileSync(
  createRequire(import.meta.url).resolve('axe-core/axe.min.js'),
  'utf8',
);

const lang = process.env.TZED_LANG ?? 'en';
const viewports = {
  phone: { width: 390, height: 844 },
  desktop: { width: 1280, height: 900 },
};
const visitors = [
  {
    who: 'guest',
    pages: [
      '/',
      '/search?q=phone',
      '/converter',
      '/help',
      '/help/contact',
      '/login',
      '/register',
      '/forgot-password',
      '/terms',
      '/shop/amina-electronics',
      'first-listing',
    ],
  },
  {
    who: 'buyer',
    email: 'buyer.zm@demo.tzed.local',
    pages: [
      '/account',
      '/orders',
      'first-order',
      '/cart',
      '/saved',
      '/messages',
      '/notifications',
      '/support/tickets',
    ],
  },
  {
    who: 'seller',
    email: 'amina@demo.tzed.local',
    pages: [
      '/account/listings',
      '/account/analytics',
      '/account/seller',
      '/sell',
      '/orders?role=selling',
    ],
  },
  {
    who: 'admin',
    email: 'admin@tzed.local',
    password: 'admin-dev-password',
    pages: [
      '/admin',
      '/admin/analytics',
      '/admin/disputes',
      '/admin/review',
      '/admin/reports',
      '/admin/tickets',
      '/admin/users',
      '/admin/listings',
      '/admin/reviews',
      '/admin/rates',
      '/admin/categories',
      '/admin/help',
      '/admin/audit',
    ],
  },
];

const browser = await chromium.launch({ executablePath });
const report = [];
const pageErrors = [];
let serious = 0;

/** Turns placeholders like "first-listing" into a real path by following a link. */
async function resolvePath(page, path) {
  const find = async (from, selector) => {
    await page.goto(base + from);
    const link = page.locator(selector).first();
    await link.waitFor();
    return link.getAttribute('href');
  };
  if (path === 'first-listing') return find('/search', 'main a[href^="/listings/"]');
  if (path === 'first-order') return find('/orders', 'main a[href^="/orders/"]');
  return path;
}

for (const visitor of visitors) {
  for (const [size, viewport] of Object.entries(viewports)) {
    const context = await browser.newContext({ viewport });
    const page = await context.newPage();
    page.on('pageerror', (e) => pageErrors.push(`${visitor.who} ${page.url()}: ${e.message}`));
    if (visitor.email) {
      await page.goto(base + '/login');
      await page.getByLabel('Email').fill(visitor.email);
      await page.getByLabel('Password').fill(visitor.password ?? 'demo-password');
      await page.getByRole('button', { name: 'Sign in' }).click();
      await page.getByRole('heading', { name: 'My account' }).waitFor();
    }
    // Sign in happens in English; every page after that uses the chosen language.
    if (lang !== 'en')
      await context.addInitScript((l) => localStorage.setItem('tzed.lang', l), lang);
    for (const entry of visitor.pages) {
      const path = await resolvePath(page, entry);
      await page.goto(base + path);
      await page.locator('main h1').first().waitFor();
      await page.waitForLoadState('networkidle');
      await page.addScriptTag({ content: axeSource });
      const result = await page.evaluate(() =>
        window.axe.run(document, {
          runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] },
        }),
      );
      const overflow =
        size === 'phone' &&
        (await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth));
      const violations = result.violations.map((v) => ({
        id: v.id,
        impact: v.impact,
        help: v.help,
        targets: v.nodes.slice(0, 5).map((n) => n.target.join(' ')),
      }));
      serious += violations.filter((v) => ['serious', 'critical'].includes(v.impact)).length;
      if (overflow) serious++;
      report.push({ who: visitor.who, size, path, overflow, violations });
      const summary = violations.map((v) => `${v.impact}: ${v.id} (${v.targets.length})`);
      if (overflow) summary.unshift('scrolls sideways on a phone');
      console.log(
        `${summary.length ? '✗' : '✓'} ${visitor.who} ${size} ${path}${summary.length ? '\n    ' + summary.join('\n    ') : ''}`,
      );
    }
    await context.close();
  }
}

writeFileSync(
  `tests/artifacts/a11y-report${lang === 'en' ? '' : `-${lang}`}.json`,
  JSON.stringify(report, null, 2),
);
if (pageErrors.length) console.log('page errors:\n  ' + pageErrors.join('\n  '));
console.log(
  `${report.length} page checks, ${serious} serious/critical problem(s). Report: tests/artifacts/a11y-report.json`,
);
if (serious || pageErrors.length) process.exitCode = 1;
await browser.close();
