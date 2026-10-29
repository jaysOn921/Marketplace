import type { Prisma } from '@prisma/client';
import type { RequestHandler } from 'express';
import { prisma } from '../db.js';
import { AppError } from '../lib/errors.js';
import { localeFrom } from '../lib/i18n.js';
import { mustSetUpTwoStep } from '../modules/auth/two-step.service.js';

const DAY_MS = 24 * 60 * 60 * 1000;

export const authUserInclude = {
  country: true,
  sellerProfile: { include: { region: true } },
} satisfies Prisma.UserInclude;

export type AuthUser = Prisma.UserGetPayload<{ include: typeof authUserInclude }>;

/**
 * Loads the signed-in user on every request. Suspended or deleted users are signed
 * out immediately, so admin actions take effect without waiting for sessions to expire.
 */
export const loadUser: RequestHandler = async (req, _res, next) => {
  const userId = req.session?.userId;
  if (!userId) return next();

  const user = await prisma.user.findUnique({ where: { id: userId }, include: authUserInclude });
  if (user && user.status === 'ACTIVE') {
    // Remember the site language they use, for notifications and emails sent later.
    const asked = req.get('accept-language');
    const locale = asked ? localeFrom(asked) : user.locale;
    // Seen today, for the dormant-account rule in the retention job.
    const now = new Date();
    const stale = !user.lastActiveAt || now.getTime() - user.lastActiveAt.getTime() > DAY_MS;
    if (locale !== user.locale || stale) {
      const data = { locale, ...(stale ? { lastActiveAt: now, dormantWarnedAt: null } : {}) };
      await prisma.user.update({ where: { id: user.id }, data });
      Object.assign(user, data);
    }
    req.user = user;
  } else {
    delete req.session.userId;
  }
  next();
};

export const requireAuth: RequestHandler = (req, _res, next) => {
  next(req.user ? undefined : AppError.unauthorized());
};

export const requireAdmin: RequestHandler = (req, _res, next) => {
  if (!req.user) return next(AppError.unauthorized());
  if (req.user.role !== 'ADMIN') return next(AppError.forbidden());
  if (mustSetUpTwoStep(req.user)) {
    return next(
      new AppError(
        403,
        'TWO_STEP_SETUP_REQUIRED',
        'Turn on two-step sign-in in My account to use the admin tools.',
      ),
    );
  }
  next();
};

/** Narrows req.user for handlers behind requireAuth. */
export function currentUser(req: { user?: AuthUser }): AuthUser {
  if (!req.user) throw AppError.unauthorized();
  return req.user;
}
