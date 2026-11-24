import { createHash } from 'node:crypto';
import type { Request } from 'express';
import { pushEndpointSchema, pushSubscriptionSchema } from '@tzed/shared';
import webpush from 'web-push';
import { config } from '../../config.js';
import { prisma } from '../../db.js';
import { logger } from '../../logger.js';
import type { AuthUser } from '../../middleware/auth.js';

/** Phone notifications are on when the server has its VAPID keys. */
export const pushEnabled = () => Boolean(config.VAPID_PUBLIC_KEY && config.VAPID_PRIVATE_KEY);

if (pushEnabled()) {
  webpush.setVapidDetails(
    config.VAPID_SUBJECT,
    config.VAPID_PUBLIC_KEY!,
    config.VAPID_PRIVATE_KEY!,
  );
}

export interface PushMessage {
  title: string;
  body?: string;
  /** App path opened when the notification is tapped. */
  link?: string;
  /** Notifications with the same tag replace each other (e.g. one per conversation). */
  tag?: string;
  lang?: string;
}

/** In tests, sent notifications are collected here instead of going to a push service. */
export const testPushOutbox: { endpoint: string; message: PushMessage }[] = [];

const hash = (endpoint: string) => createHash('sha256').update(endpoint).digest('hex');

/** Saves this phone's subscription for the signed-in person (moving it if it was someone else's). */
export async function subscribe(user: AuthUser, input: unknown, req: Request) {
  const { endpoint, keys } = pushSubscriptionSchema.parse(input);
  const data = {
    userId: user.id,
    endpoint,
    p256dh: keys.p256dh,
    auth: keys.auth,
    userAgent: req.get('user-agent')?.slice(0, 255) ?? null,
  };
  await prisma.pushSubscription.upsert({
    where: { endpointHash: hash(endpoint) },
    create: { ...data, endpointHash: hash(endpoint) },
    update: data,
  });
}

/** Stops notifications to one phone, e.g. when they turn it off or sign out there. */
export async function unsubscribe(user: AuthUser, input: unknown) {
  const { endpoint } = pushEndpointSchema.parse(input);
  await prisma.pushSubscription.deleteMany({
    where: { userId: user.id, endpointHash: hash(endpoint) },
  });
}

export async function unsubscribeAll(userId: number) {
  await prisma.pushSubscription.deleteMany({ where: { userId } });
}

export const deviceCount = (userId: number) => prisma.pushSubscription.count({ where: { userId } });

/** Sends to every phone the person turned notifications on for. Never throws. */
export async function sendPush(userId: number, message: PushMessage) {
  if (!pushEnabled() && !config.isTest) return;
  const subs = await prisma.pushSubscription.findMany({ where: { userId } });
  await Promise.all(
    subs.map(async (s) => {
      try {
        if (config.isTest) {
          testPushOutbox.push({ endpoint: s.endpoint, message });
        } else {
          await webpush.sendNotification(
            { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
            JSON.stringify(message),
            { TTL: 24 * 60 * 60, urgency: 'high' },
          );
        }
        await prisma.pushSubscription.update({
          where: { id: s.id },
          data: { lastSentAt: new Date() },
        });
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) {
          // The phone unsubscribed or the app was removed: forget it.
          await prisma.pushSubscription.delete({ where: { id: s.id } }).catch(() => undefined);
        } else {
          logger.warn({ err, userId, status }, 'Push notification not sent');
        }
      }
    }),
  );
}

export function sendPushInBackground(userId: number, message: PushMessage) {
  sendPush(userId, message).catch((err: unknown) =>
    logger.warn({ err, userId }, 'Push notification failed'),
  );
}
