import { Router } from 'express';
import type { PushKeyResponse } from '@tzed/shared';
import { config } from '../../config.js';
import { currentUser, requireAuth } from '../../middleware/auth.js';
import * as push from './push.service.js';

export const pushRouter = Router();

/** The server's public key, which the browser needs to subscribe. */
pushRouter.get('/push/key', (_req, res) => {
  const body: PushKeyResponse = {
    publicKey: push.pushEnabled() ? config.VAPID_PUBLIC_KEY! : null,
  };
  res.json(body);
});

pushRouter.get('/me/push', requireAuth, async (req, res) => {
  res.json({ devices: await push.deviceCount(currentUser(req).id) });
});

pushRouter.post('/me/push', requireAuth, async (req, res) => {
  await push.subscribe(currentUser(req), req.body, req);
  res.status(204).end();
});

pushRouter.delete('/me/push', requireAuth, async (req, res) => {
  await push.unsubscribe(currentUser(req), req.body);
  res.status(204).end();
});

pushRouter.delete('/me/push/all', requireAuth, async (req, res) => {
  await push.unsubscribeAll(currentUser(req).id);
  res.status(204).end();
});
