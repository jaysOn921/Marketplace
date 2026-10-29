import { Router } from 'express';
import type { MeResponse } from '@tzed/shared';
import { prisma } from '../../db.js';
import { authUserInclude, currentUser, requireAuth } from '../../middleware/auth.js';
import { sellerAnalytics } from '../analytics/analytics.service.js';
import { SESSION_COOKIE } from '../auth/session-store.js';
import { toSessionUser } from './user-dto.js';
import * as twoStep from '../auth/two-step.service.js';
import * as users from './users.service.js';

export const usersRouter = Router();
usersRouter.use(requireAuth);

async function freshMe(userId: number): Promise<MeResponse> {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    include: authUserInclude,
  });
  return { user: toSessionUser(user) };
}

usersRouter.patch('/', async (req, res) => {
  const user = currentUser(req);
  await users.updateProfile(user, req.body, req);
  res.json(await freshMe(user.id));
});

usersRouter.post('/password', async (req, res) => {
  await users.changePassword(currentUser(req), req.body, req);
  res.json({ ok: true });
});

usersRouter.post('/two-step/setup', async (req, res) => {
  res.set('Cache-Control', 'no-store').json(await twoStep.beginSetup(currentUser(req)));
});

usersRouter.post('/two-step/enable', async (req, res) => {
  const user = currentUser(req);
  const { backupCodes } = await twoStep.enable(user, req.body, req);
  res.set('Cache-Control', 'no-store').json({ backupCodes, ...(await freshMe(user.id)) });
});

usersRouter.post('/two-step/backup-codes', async (req, res) => {
  res
    .set('Cache-Control', 'no-store')
    .json(await twoStep.regenerateBackupCodes(currentUser(req), req.body, req));
});

usersRouter.post('/two-step/disable', async (req, res) => {
  const user = currentUser(req);
  await twoStep.disable(user, req.body, req, users.checkPassword);
  res.json(await freshMe(user.id));
});

usersRouter.put('/phone-sharing', async (req, res) => {
  const user = currentUser(req);
  await users.setPhoneSharing(user, req.body, req);
  res.json(await freshMe(user.id));
});

usersRouter.put('/marketing', async (req, res) => {
  const user = currentUser(req);
  await users.setMarketing(user, req.body, req);
  res.json(await freshMe(user.id));
});

usersRouter.put('/seller-profile', async (req, res) => {
  const user = currentUser(req);
  await users.upsertSellerProfile(user, req.body);
  res.json(await freshMe(user.id));
});

usersRouter.get('/analytics', async (req, res) => {
  res.set('Cache-Control', 'no-store').json(await sellerAnalytics(currentUser(req), req.query));
});

usersRouter.get('/export', async (req, res) => {
  const data = await users.exportData(currentUser(req), req);
  res
    .set('Cache-Control', 'no-store')
    .attachment(`tzed-data-${new Date().toISOString().slice(0, 10)}.json`)
    .json(data);
});

usersRouter.delete('/', async (req, res) => {
  await users.deleteAccount(currentUser(req), req.body, req);
  // Destroy the in-memory session too, or express-session would save it again.
  await new Promise<void>((resolve, reject) =>
    req.session.destroy((err) => (err ? reject(err) : resolve())),
  );
  res.clearCookie(SESSION_COOKIE, { path: '/' }).status(204).end();
});
