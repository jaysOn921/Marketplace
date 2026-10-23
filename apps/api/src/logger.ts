import { pino } from 'pino';
import { config } from './config.js';

export const logger = pino({
  level: config.LOG_LEVEL,
  redact: [
    'req.headers.cookie',
    'req.headers.authorization',
    'req.headers["x-csrf-token"]',
    'req.query.token',
    'res.headers["set-cookie"]',
  ],
});

/** Hides private link tokens (guest support tickets use ?token=) in logged URLs. */
export function redactUrl(url: string): string {
  return url.replace(/([?&]token=)[^&#]*/gi, '$1[Redacted]');
}
