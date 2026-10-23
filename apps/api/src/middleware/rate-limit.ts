import type { Request } from 'express';
import { ipKeyGenerator, rateLimit } from 'express-rate-limit';
import type { ApiError } from '@tzed/shared';

const body: ApiError = {
  error: {
    code: 'RATE_LIMITED',
    message: 'Too many attempts. Please wait a few minutes and try again.',
  },
};

function limiter(windowMinutes: number, limit: number, key?: (req: Request) => string) {
  return rateLimit({
    windowMs: windowMinutes * 60_000,
    limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    keyGenerator: (req) => ipKeyGenerator(req.ip ?? '') + (key ? `:${key(req)}` : ''),
    handler: (_req, res) => res.status(429).json(body),
  });
}

const emailOf = (req: Request) =>
  String(req.body?.email ?? '')
    .trim()
    .toLowerCase();

export function createRateLimits() {
  return {
    /** Per IP + email, so one attacker can't lock everyone out and can't brute-force one account. */
    login: limiter(15, 10, emailOf),
    register: limiter(60, 10),
    /** Password reset and verification emails. */
    email: limiter(60, 5),
  };
}

export type RateLimits = ReturnType<typeof createRateLimits>;
