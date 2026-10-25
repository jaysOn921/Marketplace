import { APP_NAME } from '@tzed/shared';
import { prisma } from '../db.js';
import { renderEmail } from '../lib/email-layout.js';
import { translate, type Locale } from '../lib/i18n.js';
import { sendMail } from '../lib/mailer.js';
import { logger } from '../logger.js';
import { recordAudit } from '../modules/audit/audit.service.js';
import { destroyUserSessions, pruneExpiredSessions } from '../modules/auth/session-store.js';
import { anonymiseUser } from '../modules/users/users.service.js';

const DAY = 24 * 60 * 60 * 1000;
const daysAgo = (now: Date, days: number) => new Date(now.getTime() - days * DAY);

/**
 * How long personal data is kept (docs/data-protection.md, section 6). Orders, messages and
 * reviews are kept: the other party and tax law need them, and deletion anonymises the person.
 */
export const RETENTION = {
  /** Spent or expired sign-in and email links. */
  authTokensDays: 7,
  /** IP address and browser in the audit log; the action itself is kept. */
  auditNetworkDays: 365,
  notificationsDays: 365,
  /** Daily views and cart adds per listing. */
  listingStatsDays: 730,
  /** No visit for this long makes an account dormant; we warn, then remove it. */
  dormantDays: 3 * 365,
  dormantNoticeDays: 30,
};

/** Runs every rule once. Safe to run again at any time (and on several servers). */
export async function runRetention(now = new Date()) {
  const result = {
    sessions: (await pruneExpiredSessions()).count,
    authTokens: (
      await prisma.authToken.deleteMany({
        where: { expiresAt: { lt: daysAgo(now, RETENTION.authTokensDays) } },
      })
    ).count,
    auditNetwork: (
      await prisma.auditLog.updateMany({
        where: {
          createdAt: { lt: daysAgo(now, RETENTION.auditNetworkDays) },
          OR: [{ ip: { not: null } }, { userAgent: { not: null } }],
        },
        data: { ip: null, userAgent: null },
      })
    ).count,
    notifications: (
      await prisma.notification.deleteMany({
        where: { createdAt: { lt: daysAgo(now, RETENTION.notificationsDays) } },
      })
    ).count,
    listingStats: (
      await prisma.listingDailyStat.deleteMany({
        where: { day: { lt: daysAgo(now, RETENTION.listingStatsDays) } },
      })
    ).count,
    ...(await dormantAccounts(now)),
  };
  logger.info({ retention: result }, 'Retention job finished');
  return result;
}

async function dormantAccounts(now: Date) {
  const cutoff = daysAgo(now, RETENTION.dormantDays);
  const busy = { status: { in: ['PLACED' as const, 'ACCEPTED' as const, 'READY' as const] } };
  const dormant = await prisma.user.findMany({
    where: {
      role: 'USER',
      status: 'ACTIVE',
      createdAt: { lt: cutoff },
      AND: [
        { OR: [{ lastActiveAt: null }, { lastActiveAt: { lt: cutoff } }] },
        { OR: [{ lastLoginAt: null }, { lastLoginAt: { lt: cutoff } }] },
      ],
      // Never while an order or a problem is still open.
      ordersAsBuyer: { none: busy },
      ordersAsSeller: { none: busy },
    },
    select: { id: true, email: true, name: true, locale: true, dormantWarnedAt: true },
  });

  let dormantWarned = 0;
  let dormantRemoved = 0;
  for (const user of dormant) {
    const openProblem = await prisma.orderDispute.count({
      where: {
        status: 'OPEN',
        order: { OR: [{ buyerId: user.id }, { sellerId: user.id }] },
      },
    });
    if (openProblem) continue;

    if (!user.dormantWarnedAt) {
      // The 30 days only start once the warning has actually been sent.
      const locale = user.locale as Locale;
      const sent = await sendMail({
        to: user.email,
        subject: translate(`Your ${APP_NAME} account will be closed`, locale),
        ...renderEmail({
          locale,
          name: user.name,
          paragraphs: [
            `You haven't used your ${APP_NAME} account for 3 years. To protect your personal information, we will close it and delete your details in 30 days.`,
            'To keep it, just sign in before then.',
          ],
          action: { label: 'Sign in', path: '/login' },
        }),
      }).then(
        () => true,
        (err: unknown) => (
          logger.warn({ err, userId: user.id }, 'Dormant warning not sent'),
          false
        ),
      );
      if (!sent) continue;
      await prisma.user.update({ where: { id: user.id }, data: { dormantWarnedAt: now } });
      dormantWarned++;
    } else if (user.dormantWarnedAt < daysAgo(now, RETENTION.dormantNoticeDays)) {
      await prisma.$transaction(async (tx) => {
        await anonymiseUser(tx, user.id);
        await recordAudit(
          { action: 'user.dormant_delete', targetType: 'user', targetId: user.id },
          tx,
        );
      });
      await destroyUserSessions(user.id);
      dormantRemoved++;
    }
  }
  return { dormantWarned, dormantRemoved };
}

/** Runs the job shortly after start-up and then once a day. */
export function scheduleRetention() {
  const run = () =>
    runRetention().catch((err: unknown) => logger.error({ err }, 'Retention job failed'));
  setTimeout(run, 60_000).unref();
  setInterval(run, DAY).unref();
}
