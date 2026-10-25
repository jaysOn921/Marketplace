import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

// Load the repo-root .env (same relative depth from src/ and dist/).
const envPath = fileURLToPath(new URL('../../../.env', import.meta.url));
if (process.env.NODE_ENV !== 'test' && existsSync(envPath)) {
  process.loadEnvFile(envPath);
}

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  APP_URL: z.url().default('http://localhost:5173'),
  DATABASE_URL: z.string().startsWith('mysql://'),
  SESSION_SECRET: z.string().min(16).default('dev-only-session-secret-change-me'),
  // e.g. smtps://user:pass@smtp.example.com:465 — unset in dev: emails go to tests/artifacts/outbox/
  SMTP_URL: z.string().optional(),
  MAIL_FROM: z.string().default('TZed <no-reply@tzed.local>'),
  // Where uploaded images are stored (local disk driver). Defaults to <repo>/uploads.
  UPLOAD_DIR: z.string().optional(),
  // Development only (browser test runs sign in many times): refused in production.
  DISABLE_RATE_LIMITS: z.stringbool().default(false),
  /** Daily clean-up of old personal data (src/jobs/retention.ts). */
  RETENTION_JOB: z.stringbool().default(true),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
});

const parsed = envSchema
  .superRefine((env, ctx) => {
    if (env.NODE_ENV !== 'production') return;
    if (env.SESSION_SECRET.length < 32 || env.SESSION_SECRET.startsWith('dev-only')) {
      ctx.addIssue({
        code: 'custom',
        path: ['SESSION_SECRET'],
        message: 'Set a random SESSION_SECRET of at least 32 characters in production.',
      });
    }
    if (env.DISABLE_RATE_LIMITS) {
      ctx.addIssue({
        code: 'custom',
        path: ['DISABLE_RATE_LIMITS'],
        message: 'Rate limits cannot be turned off in production.',
      });
    }
    if (!env.SMTP_URL) {
      ctx.addIssue({
        code: 'custom',
        path: ['SMTP_URL'],
        message: 'SMTP_URL is required in production.',
      });
    }
  })
  .safeParse(process.env);
if (!parsed.success) {
  console.error('Invalid environment configuration:', z.prettifyError(parsed.error));
  process.exit(1);
}

export const config = {
  ...parsed.data,
  UPLOAD_DIR:
    parsed.data.UPLOAD_DIR ?? fileURLToPath(new URL('../../../uploads/', import.meta.url)),
  isProduction: parsed.data.NODE_ENV === 'production',
  isTest: parsed.data.NODE_ENV === 'test',
  version: process.env.npm_package_version ?? '0.1.0',
};
