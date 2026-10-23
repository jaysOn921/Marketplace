import { Router } from 'express';
import type { CsrfResponse, MeResponse } from '@tzed/shared';
import { forgotPasswordSchema, verifyEmailSchema } from '@tzed/shared';
import { currentUser, requireAuth } from '../../middleware/auth.js';
import { ensureCsrfToken } from '../../middleware/csrf.js';
import type { RateLimits } from '../../middleware/rate-limit.js';
import { prisma } from '../../db.js';
import { authUserInclude } from '../../middleware/auth.js';
import { SESSION_COOKIE } from './session-store.js';
import { toSessionUser } from '../users/user-dto.js';
import * as auth from './auth.service.js';

export function authRouter(limits: RateLimits | null) {
  const router = Router();
  const limit = (name: keyof RateLimits) => limits?.[name] ?? ((_req, _res, next) => next());

  router.get('/csrf', (req, res) => {
    const body: CsrfResponse = { csrfToken: ensureCsrfToken(req.session) };
    res.set('Cache-Control', 'no-store').json(body);
  });

  router.get('/me', (req, res) => {
    const body: MeResponse = { user: req.user ? toSessionUser(req.user) : null };
    res.set('Cache-Control', 'no-store').json(body);
  });

  router.post('/register', limit('register'), async (req, res) => {
    const user = await auth.register(req.body, req);
    const csrfToken = await auth.startSession(req, user.id);
    const full = await prisma.user.findUniqueOrThrow({
      where: { id: user.id },
      include: authUserInclude,
    });
    res.status(201).json({ user: toSessionUser(full), csrfToken });
  });

  router.post('/login', limit('login'), async (req, res) => {
    const { userId, csrfToken } = await auth.login(req.body, req);
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: userId },
      include: authUserInclude,
    });
    res.json({ user: toSessionUser(user), csrfToken });
  });

  router.post('/logout', async (req, res) => {
    await auth.logout(req);
    res.clearCookie(SESSION_COOKIE, { path: '/' }).status(204).end();
  });

  router.post('/verify-email', async (req, res) => {
    await auth.verifyEmail(verifyEmailSchema.parse(req.body).token, req);
    res.json({ ok: true });
  });

  router.post('/resend-verification', requireAuth, limit('email'), async (req, res) => {
    await auth.resendVerification(currentUser(req).id);
    res.json({ ok: true });
  });

  router.post('/forgot-password', limit('email'), async (req, res) => {
    await auth.requestPasswordReset(forgotPasswordSchema.parse(req.body).email, req);
    res.json({ ok: true });
  });

  router.post('/reset-password', limit('email'), async (req, res) => {
    await auth.resetPassword(req.body, req);
    res.json({ ok: true });
  });

  return router;
}
