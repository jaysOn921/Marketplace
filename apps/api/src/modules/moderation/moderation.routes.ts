import { Router } from 'express';
import { idParam } from '../../lib/params.js';
import { currentUser, requireAdmin } from '../../middleware/auth.js';
import * as moderation from './moderation.service.js';

export const moderationRouter = Router();
moderationRouter.use(requireAdmin);

moderationRouter.get('/review-queue', async (req, res) => {
  res
    .set('Cache-Control', 'no-store')
    .json({ listings: await moderation.reviewQueue(currentUser(req)) });
});

moderationRouter.get('/review-queue/count', async (_req, res) => {
  res.set('Cache-Control', 'no-store').json({ count: await moderation.pendingCount() });
});

moderationRouter.post('/:id/approve', async (req, res) => {
  await moderation.approveListing(currentUser(req), idParam(req.params.id), req);
  res.json({ ok: true });
});

moderationRouter.post('/:id/reject', async (req, res) => {
  await moderation.rejectListing(currentUser(req), idParam(req.params.id), req.body, req);
  res.json({ ok: true });
});
