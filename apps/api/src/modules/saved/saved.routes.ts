import { Router } from 'express';
import { idParam } from '../../lib/params.js';
import { currentUser, requireAuth } from '../../middleware/auth.js';
import * as saved from './saved.service.js';

export const savedRouter = Router();

savedRouter.get('/me/saved', requireAuth, async (req, res) => {
  res.set('Cache-Control', 'no-store').json(await saved.listSaved(currentUser(req)));
});
savedRouter.put('/me/saved/:listingId', requireAuth, async (req, res) => {
  await saved.saveListing(currentUser(req), idParam(req.params.listingId));
  res.status(204).end();
});
savedRouter.delete('/me/saved/:listingId', requireAuth, async (req, res) => {
  await saved.unsaveListing(currentUser(req), idParam(req.params.listingId));
  res.status(204).end();
});

/** Public: live listings by id, for the "Recently viewed" strip (ids are kept on the device). */
savedRouter.get('/listings/by-ids', async (req, res) => {
  const ids = String(req.query.ids ?? '')
    .split(',')
    .map(Number)
    .filter((n) => Number.isInteger(n) && n > 0);
  res.json({ listings: await saved.listingsByIds(ids) });
});
