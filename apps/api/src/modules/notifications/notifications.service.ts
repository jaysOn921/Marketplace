import { APP_NAME } from '@tzed/shared';
import { prisma } from '../../db.js';
import { renderEmail } from '../../lib/email-layout.js';
import { sendMailInBackground } from '../../lib/mailer.js';

export interface NotificationInput {
  type: string; // e.g. listing.approved, order.placed, message.new
  title: string;
  body?: string;
  /** App path, e.g. /orders/12 */
  link?: string;
  /** Also send an email. */
  email?: boolean;
  /** Button text in the email (defaults to "Open TZed"). */
  actionLabel?: string;
}

/** Stores an in-app notification (shown under the bell) and optionally emails it. */
export async function notify(userId: number, n: NotificationInput) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || user.status !== 'ACTIVE') return;

  await prisma.notification.create({
    data: { userId, type: n.type, title: n.title, body: n.body ?? null, link: n.link ?? null },
  });

  if (n.email) {
    sendMailInBackground({
      to: user.email,
      subject: `${n.title} — ${APP_NAME}`,
      ...renderEmail({
        name: user.name,
        paragraphs: [n.body ?? n.title],
        action: n.link ? { label: n.actionLabel ?? `Open ${APP_NAME}`, path: n.link } : undefined,
      }),
    });
  }
}
