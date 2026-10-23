import { Router } from 'express';
import type { ConversationResponse, ConversationsResponse } from '@tzed/shared';
import { ipKeyGenerator, rateLimit } from 'express-rate-limit';
import { idParam } from '../../lib/params.js';
import { currentUser, requireAuth } from '../../middleware/auth.js';
import * as messaging from './messaging.service.js';

export function messagingRouter(rateLimited: boolean) {
  const router = Router();
  router.use(requireAuth);

  // At most 30 messages a minute per person: plenty for a chat, too slow for spam.
  const limit = rateLimited
    ? rateLimit({
        windowMs: 60_000,
        limit: 30,
        keyGenerator: (req) => (req.user ? `u${req.user.id}` : ipKeyGenerator(req.ip ?? '')),
        handler: (_req, res) =>
          res.status(429).json({
            error: {
              code: 'RATE_LIMITED',
              message: 'You are sending messages too quickly. Please wait a moment.',
            },
          }),
      })
    : (_req: unknown, _res: unknown, next: () => void) => next();

  router.get('/', async (req, res) => {
    const body: ConversationsResponse = await messaging.listConversations(currentUser(req));
    res.set('Cache-Control', 'no-store').json(body);
  });

  router.post('/', limit, async (req, res) => {
    const user = currentUser(req);
    const id = await messaging.startConversation(user, req.body);
    const body: ConversationResponse = await messaging.readConversation(user, id);
    res.status(201).json(body);
  });

  router.get('/:id', async (req, res) => {
    const before = Number(req.query.before) || undefined;
    const body: ConversationResponse = await messaging.readConversation(
      currentUser(req),
      idParam(req.params.id),
      before,
    );
    res.set('Cache-Control', 'no-store').json(body);
  });

  router.post('/:id/messages', limit, async (req, res) => {
    const user = currentUser(req);
    const id = idParam(req.params.id);
    await messaging.sendMessage(user, id, req.body);
    const body: ConversationResponse = await messaging.readConversation(user, id);
    res.status(201).json(body);
  });

  return router;
}
