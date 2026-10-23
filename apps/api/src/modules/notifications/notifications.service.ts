import { APP_NAME } from '@tzed/shared';
import { config } from '../../config.js';
import { prisma } from '../../db.js';
import { sendMailInBackground } from '../../lib/mailer.js';

export interface NotificationInput {
  type: string; // e.g. listing.approved
  title: string;
  body?: string;
  /** App path, e.g. /listings/12 */
  link?: string;
  /** Also send an email. */
  email?: boolean;
}

/** Stores an in-app notification (and optionally emails it). The inbox UI arrives in Phase 6. */
export async function notify(userId: number, n: NotificationInput) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || user.status === 'DELETED') return;

  await prisma.notification.create({
    data: { userId, type: n.type, title: n.title, body: n.body ?? null, link: n.link ?? null },
  });

  if (n.email) {
    sendMailInBackground({
      to: user.email,
      subject: `${n.title} — ${APP_NAME}`,
      text: `Hi ${user.name},\n\n${n.body ?? n.title}\n\n${n.link ? `${config.APP_URL}${n.link}\n\n` : ''}— The ${APP_NAME} team`,
    });
  }
}
