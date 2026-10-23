import { Router } from 'express';
import { currentUser, requireAdmin, requireAuth } from '../../middleware/auth.js';
import { userLimiter } from '../../middleware/rate-limit.js';
import * as reports from './reports.service.js';

export function reportsRouter(rateLimited: boolean) {
  const router = Router();
  const limit = userLimiter(
    rateLimited,
    60,
    10,
    "You've sent a lot of reports. Please wait a little before sending more.",
  );

  router.post('/reports', requireAuth, limit, async (req, res) => {
    await reports.createReport(currentUser(req), req.body);
    res.status(201).json({ ok: true });
  });

  router.get('/admin/reports', requireAdmin, async (_req, res) => {
    res.set('Cache-Control', 'no-store').json({ groups: await reports.reportQueue() });
  });

  router.post('/admin/reports/resolve', requireAdmin, async (req, res) => {
    await reports.resolveReports(currentUser(req), req.body, req);
    res.json({ ok: true });
  });

  return router;
}
