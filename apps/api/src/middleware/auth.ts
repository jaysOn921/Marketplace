import type { Prisma } from '@prisma/client';
import type { RequestHandler } from 'express';
import { prisma } from '../db.js';
import { AppError } from '../lib/errors.js';

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
  next(req.user.role === 'ADMIN' ? undefined : AppError.forbidden());
};

/** Narrows req.user for handlers behind requireAuth. */
export function currentUser(req: { user?: AuthUser }): AuthUser {
  if (!req.user) throw AppError.unauthorized();
  return req.user;
}
