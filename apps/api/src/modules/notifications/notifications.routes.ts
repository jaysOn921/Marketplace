import { Router } from 'express';
import type { CountsResponse, NotificationsResponse } from '@tzed/shared';
import { prisma } from '../../db.js';
import { idParam } from '../../lib/params.js';
import { currentUser, requireAuth } from '../../middleware/auth.js';
import { totalUnread } from '../messaging/messaging.service.js';

// Mounted at the API root, so sign-in is required per route (not router-wide).
export const notificationsRouter = Router();

notificationsRouter.get('/notifications', requireAuth, async (req, res) => {
  const user = currentUser(req);
  const limit = Math.min(Number(req.query.limit) || 50, 100);
  const [rows, unread] = await Promise.all([
    prisma.notification.findMany({
      where: { userId: user.id },
      orderBy: { id: 'desc' },
      take: limit,
    }),
    prisma.notification.count({ where: { userId: user.id, readAt: null } }),
  ]);
  const body: NotificationsResponse = {
    notifications: rows.map((n) => ({
      id: n.id,
      type: n.type,
      title: n.title,
      body: n.body,
      link: n.link,
      read: n.readAt !== null,
      createdAt: n.createdAt.toISOString(),
    })),
    unread,
  };
  res.set('Cache-Control', 'no-store').json(body);
});

notificationsRouter.post('/notifications/read-all', requireAuth, async (req, res) => {
  await prisma.notification.updateMany({
    where: { userId: currentUser(req).id, readAt: null },
    data: { readAt: new Date() },
  });
  res.status(204).end();
});

notificationsRouter.post('/notifications/:id/read', requireAuth, async (req, res) => {
  await prisma.notification.updateMany({
    where: { id: idParam(req.params.id), userId: currentUser(req).id, readAt: null },
    data: { readAt: new Date() },
  });
  res.status(204).end();
});

/** Header badges in one request (polled by the web app). */
notificationsRouter.get('/me/counts', requireAuth, async (req, res) => {
  const user = currentUser(req);
  const [notifications, messages, ordersToAct, reviewQueue] = await Promise.all([
    prisma.notification.count({ where: { userId: user.id, readAt: null } }),
    totalUnread(user.id),
    prisma.order.count({ where: { sellerId: user.id, status: 'PLACED' } }),
    user.role === 'ADMIN'
      ? prisma.listing.count({ where: { status: 'PENDING_REVIEW' } })
      : Promise.resolve(0),
  ]);
  const body: CountsResponse = { notifications, messages, ordersToAct, reviewQueue };
  res.set('Cache-Control', 'no-store').json(body);
});
