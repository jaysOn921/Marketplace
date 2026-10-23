import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// API tests run against a real MySQL test database (never the dev database).
const testDatabaseUrl =
  process.env.TEST_DATABASE_URL ?? 'mysql://tzed:tzed_dev_password@127.0.0.1:3306/tzed_test';

// Set here (not only in test.env) so the global setup migrates the same database.
process.env.DATABASE_URL = testDatabaseUrl;

export default defineConfig({
  test: {
    environment: 'node',
    globalSetup: ['./src/test/global-setup.ts'],
    // Test files share one database, so run them one at a time.
    fileParallelism: false,
    env: {
      NODE_ENV: 'test',
      LOG_LEVEL: 'silent',
      DATABASE_URL: testDatabaseUrl,
      UPLOAD_DIR: fileURLToPath(new URL('../../tests/artifacts/uploads-test/', import.meta.url)),
    },
  },
});
