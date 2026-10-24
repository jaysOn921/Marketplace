import { Router } from 'express';
import { idParam } from '../../lib/params.js';
import { currentUser, requireAdmin, requireAuth } from '../../middleware/auth.js';
import * as disputes from './disputes.service.js';

/** Problems on orders: the parties' side under /orders and /disputes, admins under /admin. */
export const disputesRouter = Router();

disputesRouter.get('/orders/:id/dispute', requireAuth, async (req, res) => {
  const dispute = await disputes.getDispute(currentUser(req), idParam(req.params.id));
  res.set('Cache-Control', 'no-store').json({ dispute });
});
disputesRouter.post('/orders/:id/dispute', requireAuth, async (req, res) => {
  res.status(201).json({
    dispute: await disputes.openDispute(currentUser(req), idParam(req.params.id), req.body, req),
  });
});
disputesRouter.post('/disputes/:id/messages', requireAuth, async (req, res) => {
  res.status(201).json({
    dispute: await disputes.addMessage(currentUser(req), idParam(req.params.id), req.body),
  });
});

disputesRouter.get('/admin/disputes', requireAdmin, async (req, res) => {
  res.set('Cache-Control', 'no-store').json(await disputes.adminListDisputes(req.query));
});
disputesRouter.get('/admin/disputes/:id', requireAdmin, async (req, res) => {
  res.set('Cache-Control', 'no-store').json({
    dispute: await disputes.adminGetDispute(currentUser(req), idParam(req.params.id)),
  });
});
disputesRouter.post('/admin/disputes/:id/resolve', requireAdmin, async (req, res) => {
  res.json({
    dispute: await disputes.resolveDispute(currentUser(req), idParam(req.params.id), req.body, req),
  });
});
