import { Router } from 'express';
import { idParam } from '../../lib/params.js';
import { currentUser, requireAuth } from '../../middleware/auth.js';
import { userLimiter } from '../../middleware/rate-limit.js';
import * as support from './support.service.js';

export function supportRouter(rateLimited: boolean) {
  const router = Router();
  const limit = userLimiter(
    rateLimited,
    60,
    5,
    'You have opened several tickets recently. Please wait before opening another.',
  );
  const token = (q: unknown) => (typeof q === 'string' ? q : undefined);

  router.post('/tickets', limit, async (req, res) => {
    res.status(201).json(await support.createTicket(req, req.body));
  });

  router.get('/tickets', requireAuth, async (req, res) => {
    res
      .set('Cache-Control', 'no-store')
      .json({ tickets: await support.myTickets(currentUser(req).id) });
  });

  router.get('/tickets/:id', async (req, res) => {
    const ticket = await support.getTicketFor(req, idParam(req.params.id), token(req.query.token));
    res.set('Cache-Control', 'no-store').json({ ticket: support.toTicketDetail(ticket) });
  });

  router.post('/tickets/:id/messages', async (req, res) => {
    const ticket = await support.replyToTicket(
      req,
      idParam(req.params.id),
      token(req.query.token),
      req.body,
    );
    res.status(201).json({ ticket: support.toTicketDetail(ticket) });
  });

  router.post('/tickets/:id/close', async (req, res) => {
    const ticket = await support.closeTicket(req, idParam(req.params.id), token(req.query.token));
    res.json({ ticket: support.toTicketDetail(ticket) });
  });

  return router;
}
