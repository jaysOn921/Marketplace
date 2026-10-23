import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

/** Applies migrations to the test database once before the API test run. */
export default function setup() {
  const url = process.env.DATABASE_URL ?? '';
  if (!/_test(\?|$)/.test(url)) {
    throw new Error(`Refusing to run tests: DATABASE_URL must point at a *_test database (${url})`);
  }
  execFileSync('npx', ['prisma', 'migrate', 'deploy'], {
    cwd: fileURLToPath(new URL('../..', import.meta.url)),
    env: process.env,
    stdio: 'pipe',
  });
}
