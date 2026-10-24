# TZed

A cross-border marketplace for buyers and sellers in **Tanzania and Zambia**. Listings are priced in TZS or ZMW, and buyers see approximate prices in their own currency.

See [`PLAN.md`](PLAN.md) for requirements, architecture and the phase-by-phase build plan. [`docs/hardening-review.md`](docs/hardening-review.md) has the security, accessibility and performance review, and [`docs/deploy.md`](docs/deploy.md) explains production hosting with Docker, backups and restores.

## Stack

TypeScript everywhere: Express 5 API (`apps/api`), React 19 + Vite + Tailwind web app (`apps/web`), shared types and helpers (`packages/shared`), MySQL 8.

## Getting started

Requirements: Node.js 22+, MySQL 8.

```bash
npm install
cp .env.example .env          # then adjust if needed

# Start MySQL, either:
scripts/setup-local-mysql.sh                      # Ubuntu/Debian, installs MySQL if missing
docker compose -f docker-compose.dev.yml up -d    # or with Docker

npm run db:migrate -w @tzed/api   # create tables
npm run db:seed -w @tzed/api      # countries, regions, rate, categories, help + demo data

npm run dev                   # API on :4000, web on http://localhost:5173
```

Demo logins after seeding (development only): `admin@tzed.local` / `admin-dev-password`, and the demo sellers and buyers (e.g. `amina@demo.tzed.local`, `buyer.zm@demo.tzed.local`) with password `demo-password`.

API tests run against a separate `tzed_test` database (`TEST_DATABASE_URL`), migrated automatically, never the dev database.

## Scripts

| Command                                                         | What it does                                                                                                                                                               |
| --------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run dev`                                                   | Run the API and web app with hot reload                                                                                                                                    |
| `npm test`                                                      | Run all unit and integration tests                                                                                                                                         |
| `npm run lint` / `npm run typecheck`                            | Static checks                                                                                                                                                              |
| `npm run format`                                                | Format the code with Prettier                                                                                                                                              |
| `npm run build`                                                 | Production build (web, then API)                                                                                                                                           |
| `npm start`                                                     | Run the production build (the API serves the web app)                                                                                                                      |
| `npm run db:migrate -w @tzed/api -- --name <change>`            | Create and apply a migration after editing `apps/api/prisma/schema.prisma`                                                                                                 |
| `npm run db:seed -w @tzed/api`                                  | Seed reference data (safe to re-run) and dev demo data with placeholder photos                                                                                             |
| `npm run db:studio -w @tzed/api`                                | Browse the database in Prisma Studio                                                                                                                                       |
| `scripts/setup-local-mysql.sh`                                  | Install/start local MySQL and create the dev and test databases                                                                                                            |
| `scripts/rebuild-search-index.sh`                               | Rebuild MySQL full-text search indexes (run by the setup script too), e.g. after MySQL was stopped abruptly                                                                |
| `node scripts/screenshot.mjs <url> <paths…>`                    | Desktop and mobile screenshots into `tests/artifacts/`                                                                                                                     |
| `node tests/e2e/auth-flow.mjs`                                  | Browser smoke test of sign-up → verify → seller profile → sign in (dev servers running)                                                                                    |
| `node tests/e2e/listing-flow.mjs`                               | Browser smoke test of list → photo → submit → reject → resubmit → approve → live (dev servers + seed)                                                                      |
| `node tests/e2e/search-flow.mjs`                                | Browser smoke test of search: suggestions, keywords, filters, sort, shop page, mobile (dev servers + seed)                                                                 |
| `node tests/e2e/order-flow.mjs`                                 | Browser smoke test of ordering: buy (cross-border) → accept → sent → paid → received (dev servers + seed)                                                                  |
| `node tests/e2e/messaging-flow.mjs`                             | Browser smoke test of messages and notifications: ask → badges → reply → live update (dev servers + seed)                                                                  |
| `node tests/e2e/review-flow.mjs`                                | Browser smoke test of reviews: rate a completed order → shop and search show the rating (after order-flow)                                                                 |
| `node tests/e2e/support-flow.mjs`                               | Browser smoke test of help search, guest support ticket via emailed link, reporting and the admin reports queue (dev servers + seed)                                       |
| `node tests/e2e/admin-flow.mjs`                                 | Browser smoke test of the admin area: dashboard, rate, ticket reply, users, listings, review hiding, audit log (dev servers + seed)                                        |
| `node tests/e2e/cart-flow.mjs`                                  | Cart: buyer adds from two sellers → one checkout places two orders → Shop analytics and admin Analytics → orders cancelled to restore demo data (dev servers + seed)       |
| `node tests/e2e/journey.mjs`                                    | Whole marketplace with new accounts: TZ seller lists → admin approves → ZM buyer searches in K, messages, orders → completed → review → report → admin removes → audit log |
| `node tests/e2e/a11y.mjs`                                       | Accessibility (axe-core, WCAG 2.1 AA) and phone-layout check of 35 pages as guest, buyer, seller and admin; report in `tests/artifacts/a11y-report.json`                   |
| `scripts/e2e.sh [names…]`                                       | Run all browser tests in a working order (starts and stops the dev servers if needed)                                                                                      |
| `scripts/perf-search.sh [count]`                                | Search timings on a separate `tzed_perf` database with 20,000 generated listings                                                                                           |
| `scripts/backup-db.sh [--local]`                                | Back up the database and photos into `backups/` (keeps the newest 14); see `docs/deploy.md`                                                                                |
| `scripts/restore-db.sh <db.sql.gz> [--uploads <photos.tar.gz>]` | Restore a backup (asks first, takes a safety backup)                                                                                                                       |
| `node tests/e2e/production-smoke.mjs https://<domain>`          | Read-only check of a deployed site                                                                                                                                         |

## Repo layout

```
apps/api         Express API (modular monolith, feature modules in src/modules)
apps/web         React web app
packages/shared  Types, constants and helpers used by both
scripts/         Setup, backup and utility scripts
backups/         Database dumps (contents git-ignored)
tests/artifacts/ Screenshots, reports and logs from test runs (contents git-ignored)
tests/e2e/       Browser tests (Playwright scripts)
docs/            Deploy guide and the hardening review
Dockerfile, docker-compose.yml, Caddyfile   Production image and stack (docs/deploy.md)
```
