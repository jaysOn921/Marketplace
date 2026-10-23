import type { RequestHandler } from 'express';
import { AppError } from '../lib/errors.js';
import { randomToken, safeEqual } from '../lib/tokens.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
export const CSRF_HEADER = 'x-csrf-token';

/** Returns the session's CSRF token, creating one if needed. */
export function ensureCsrfToken(session: { csrfToken?: string }): string {
  session.csrfToken ??= randomToken();
  return session.csrfToken;
}

/**
 * Synchronizer-token CSRF protection: every state-changing request must send the
 * session's token in the X-CSRF-Token header (fetched from GET /auth/csrf).
 */
export const csrfProtection: RequestHandler = (req, _res, next) => {
  if (SAFE_METHODS.has(req.method)) return next();
  const sent = req.get(CSRF_HEADER);
  const expected = req.session.csrfToken;
  if (!sent || !expected || !safeEqual(sent, expected)) {
    return next(
      new AppError(403, 'CSRF_INVALID', 'Your session has expired. Please refresh and try again.'),
    );
  }
  next();
};
