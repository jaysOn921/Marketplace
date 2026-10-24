import { Router } from 'express';
import { idParam } from '../../lib/params.js';
import { currentUser, requireAdmin } from '../../middleware/auth.js';
import { adminAnalytics } from '../analytics/analytics.service.js';
import * as admin from './admin.service.js';

/** Everything under /api/v1/admin (admins only). */
export const adminRouter = Router();
adminRouter.use(requireAdmin);
adminRouter.use((_req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});

adminRouter.get('/stats', async (_req, res) => res.json(await admin.stats()));
adminRouter.get('/analytics', async (req, res) => res.json(await adminAnalytics(req.query)));

adminRouter.get('/users', async (req, res) => res.json(await admin.listUsers(req.query)));
adminRouter.post('/users/:id/suspend', async (req, res) => {
  await admin.setUserStatus(currentUser(req), idParam(req.params.id), true, req.body, req);
  res.json({ ok: true });
});
adminRouter.post('/users/:id/reinstate', async (req, res) => {
  await admin.setUserStatus(currentUser(req), idParam(req.params.id), false, req.body, req);
  res.json({ ok: true });
});

adminRouter.post('/users/:id/verify', async (req, res) => {
  await admin.setSellerVerified(currentUser(req), idParam(req.params.id), true, req.body, req);
  res.json({ ok: true });
});
adminRouter.post('/users/:id/unverify', async (req, res) => {
  await admin.setSellerVerified(currentUser(req), idParam(req.params.id), false, req.body, req);
  res.json({ ok: true });
});

adminRouter.get('/listings', async (req, res) => res.json(await admin.listListings(req.query)));
adminRouter.post('/listings/:id/remove', async (req, res) => {
  res.json({
    status: await admin.setListingRemoved(
      currentUser(req),
      idParam(req.params.id),
      true,
      req.body,
      req,
    ),
  });
});
adminRouter.post('/listings/:id/restore', async (req, res) => {
  res.json({
    status: await admin.setListingRemoved(
      currentUser(req),
      idParam(req.params.id),
      false,
      req.body,
      req,
    ),
  });
});

adminRouter.get('/reviews', async (req, res) => res.json(await admin.listReviews(req.query)));
adminRouter.post('/reviews/:id/hide', async (req, res) => {
  await admin.setReviewHidden(currentUser(req), idParam(req.params.id), true, req.body, req);
  res.json({ ok: true });
});
adminRouter.post('/reviews/:id/unhide', async (req, res) => {
  await admin.setReviewHidden(currentUser(req), idParam(req.params.id), false, req.body, req);
  res.json({ ok: true });
});

adminRouter.get('/tickets', async (req, res) => res.json(await admin.listTickets(req.query)));
adminRouter.post('/tickets/:id/reply', async (req, res) => {
  await admin.replyToTicket(currentUser(req), idParam(req.params.id), req.body, req);
  res.status(201).json({ ok: true });
});
adminRouter.post('/tickets/:id/close', async (req, res) => {
  await admin.closeTicket(currentUser(req), idParam(req.params.id), req);
  res.json({ ok: true });
});

adminRouter.get('/rates', async (_req, res) => res.json({ history: await admin.rateHistory() }));
adminRouter.post('/rates', async (req, res) => {
  await admin.setRate(currentUser(req), req.body, req);
  res.status(201).json({ ok: true });
});

adminRouter.get('/categories', async (_req, res) =>
  res.json({ categories: await admin.listCategories() }),
);
adminRouter.post('/categories', async (req, res) => {
  res.status(201).json({ id: await admin.saveCategory(currentUser(req), null, req.body, req) });
});
adminRouter.put('/categories/:id', async (req, res) => {
  res.json({
    id: await admin.saveCategory(currentUser(req), idParam(req.params.id), req.body, req),
  });
});

adminRouter.get('/help/articles', async (_req, res) =>
  res.json({ articles: await admin.listFaq() }),
);
adminRouter.post('/help/articles', async (req, res) => {
  res.status(201).json({ id: await admin.saveFaq(currentUser(req), null, req.body, req) });
});
adminRouter.put('/help/articles/:id', async (req, res) => {
  res.json({ id: await admin.saveFaq(currentUser(req), idParam(req.params.id), req.body, req) });
});

adminRouter.get('/audit', async (req, res) => res.json(await admin.auditLog(req.query)));
