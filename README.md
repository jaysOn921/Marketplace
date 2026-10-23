# TZed

A cross-border marketplace for buyers and sellers in **Tanzania and Zambia**. Listings are priced in TZS or ZMW, and buyers see approximate prices in their own currency.

See [`PLAN.md`](PLAN.md) for requirements, architecture and the phase-by-phase build plan.

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

| Command                                      | What it does                                                                            |
| -------------------------------------------- | --------------------------------------------------------------------------------------- |
| `npm run dev`                                | Run the API and web app with hot reload                                                 |
| `npm test`                                   | Run all unit and integration tests                                                      |
| `npm run lint` / `npm run typecheck`         | Static checks                                                                           |
| `npm run format`                             | Format the code with Prettier                                                           |
| `npm run build`                              | Production build (web, then API)                                                        |
| `npm start`                                  | Run the production build (the API serves the web app)                                   |
| `node scripts/screenshot.mjs <url> <paths…>` | Desktop and mobile screenshots into `tests/artifacts/`                                  |
| `node tests/e2e/auth-flow.mjs`               | Browser smoke test of sign-up → verify → seller profile → sign in (dev servers running) |

## Repo layout

```
apps/api         Express API (modular monolith, feature modules in src/modules)
apps/web         React web app
packages/shared  Types, constants and helpers used by both
scripts/         Setup, backup and utility scripts
backups/         Database dumps (contents git-ignored)
tests/artifacts/ Screenshots, reports and logs from test runs (contents git-ignored)
```
