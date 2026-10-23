import session from 'express-session';
import { prisma } from '../../db.js';

export const SESSION_COOKIE = 'tzed.sid';

type Callback<T = void> = (err?: unknown, value?: T) => void;

function expiryOf(sess: session.SessionData): number {
  const expires = sess.cookie?.expires ? new Date(sess.cookie.expires) : null;
  const ms = expires ? expires.getTime() : Date.now() + 24 * 60 * 60 * 1000;
  return Math.floor(ms / 1000);
}

/** express-session store backed by the `sessions` table (via Prisma). */
export class PrismaSessionStore extends session.Store {
  override get(sid: string, cb: Callback<session.SessionData | null>) {
    prisma.session
      .findUnique({ where: { id: sid } })
      .then((row) => {
        if (!row || row.expires * 1000 < Date.now()) return cb(null, null);
        cb(null, JSON.parse(row.data) as session.SessionData);
      })
      .catch(cb);
  }

  override set(sid: string, sess: session.SessionData, cb?: Callback) {
    const data = {
      userId: sess.userId ?? null,
      expires: expiryOf(sess),
      data: JSON.stringify(sess),
    };
    prisma.session
      .upsert({ where: { id: sid }, update: data, create: { id: sid, ...data } })
      .then(() => {
        // Occasionally clear out expired sessions.
        if (Math.random() < 0.01) void pruneExpiredSessions();
        cb?.();
      })
      .catch((err: unknown) => cb?.(err));
  }

  override touch(sid: string, sess: session.SessionData, cb?: Callback) {
    prisma.session
      .updateMany({ where: { id: sid }, data: { expires: expiryOf(sess) } })
      .then(() => cb?.())
      .catch((err: unknown) => cb?.(err));
  }

  override destroy(sid: string, cb?: Callback) {
    prisma.session
      .deleteMany({ where: { id: sid } })
      .then(() => cb?.())
      .catch((err: unknown) => cb?.(err));
  }
}

export function pruneExpiredSessions() {
  return prisma.session.deleteMany({ where: { expires: { lt: Math.floor(Date.now() / 1000) } } });
}

/** Signs a user out everywhere, optionally keeping the current session. */
export function destroyUserSessions(userId: number, exceptSessionId?: string) {
  return prisma.session.deleteMany({
    where: { userId, ...(exceptSessionId ? { id: { not: exceptSessionId } } : {}) },
  });
}
