import { Router } from 'express';
import { idParam } from '../../lib/params.js';
import { currentUser, requireAuth } from '../../middleware/auth.js';
import * as reviews from './reviews.service.js';

// Mounted at the API root (before the orders router, whose /:id/:action route would match first).
export const reviewsRouter = Router();

reviewsRouter.post('/orders/:id/review', requireAuth, async (req, res) => {
  await reviews.createReview(currentUser(req), idParam(req.params.id), req.body);
  res.status(201).json({ ok: true });
});

reviewsRouter.get('/shops/:slug/reviews', async (req, res) => {
  const page = Math.max(1, Math.min(Number(req.query.page) || 1, 500));
  res
    .set('Cache-Control', 'no-store')
    .json(await reviews.listSellerReviews(String(req.params.slug), page));
});
