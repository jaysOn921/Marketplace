import type { Request } from 'express';
import {
  guestContactSchema,
  ticketReplySchema,
  ticketSchema,
  type TicketDetail,
  type TicketSummary,
} from '@tzed/shared';
import { prisma } from '../../db.js';
import { renderEmail } from '../../lib/email-layout.js';
import { AppError } from '../../lib/errors.js';
import { requestLocale, translate } from '../../lib/i18n.js';
import { sendMailInBackground } from '../../lib/mailer.js';
import { hashToken, randomToken, safeEqual } from '../../lib/tokens.js';
import { notify } from '../notifications/notifications.service.js';

type TicketRow = NonNullable<Awaited<ReturnType<typeof loadTicket>>>;

const loadTicket = (id: number) =>
  prisma.supportTicket.findUnique({
    where: { id },
    include: { messages: { orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] } },
  });

export const toTicketSummary = (t: {
  id: number;
  subject: string;
  status: TicketSummary['status'];
  createdAt: Date;
  updatedAt: Date;
}): TicketSummary => ({
  id: t.id,
  subject: t.subject,
  status: t.status,
  createdAt: t.createdAt.toISOString(),
  updatedAt: t.updatedAt.toISOString(),
});

export const toTicketDetail = (t: TicketRow): TicketDetail => ({
  ...toTicketSummary(t),
  name: t.name,
  email: t.email,
  messages: t.messages.map((m) => ({
    id: m.id,
    body: m.body,
    fromStaff: m.isStaff,
    createdAt: m.createdAt.toISOString(),
  })),
});

/** Tell admins (in-app) that a ticket needs attention. */
async function notifyAdmins(ticketId: number, title: string, body: string) {
  const admins = await prisma.user.findMany({
    where: { role: 'ADMIN', status: 'ACTIVE' },
    select: { id: true },
  });
  await Promise.all(
    admins.map((a) =>
      notify(a.id, { type: 'ticket.new', title, body, link: `/admin/tickets/${ticketId}` }),
    ),
  );
}

/** Anyone can contact support. Guests get a private link to follow the conversation. */
export async function createTicket(req: Request, input: unknown) {
  const data = ticketSchema.parse(input);
  const user = req.user;
  const contact = user
    ? { name: user.name, email: user.email }
    : guestContactSchema.parse({ name: data.name, email: data.email });
  const token = user ? null : randomToken();

  const ticket = await prisma.supportTicket.create({
    data: {
      userId: user?.id ?? null,
      name: contact.name,
      email: contact.email,
      subject: data.subject,
      accessTokenHash: token ? hashToken(token) : null,
      messages: { create: { authorId: user?.id ?? null, isStaff: false, body: data.body } },
    },
  });

  const path = `/support/tickets/${ticket.id}${token ? `?token=${encodeURIComponent(token)}` : ''}`;
  sendMailInBackground({
    to: contact.email,
    subject: translate(
      `We received your message: ${data.subject} [#${ticket.id}]`,
      requestLocale(req),
    ),
    ...renderEmail({
      locale: requestLocale(req),
      name: contact.name,
      paragraphs: [
        `Thanks for contacting TZed support. Your ticket number is #${ticket.id}. We usually reply within one working day.`,
        `You wrote: “${data.body.slice(0, 300)}${data.body.length > 300 ? '…' : ''}”`,
      ],
      action: { label: 'View your ticket', path },
      note: token
        ? 'Keep this email: the link is how you follow and reply to your ticket.'
        : undefined,
    }),
  });
  await notifyAdmins(ticket.id, `New support ticket #${ticket.id}`, data.subject);
  return { id: ticket.id, token };
}

/** The ticket's owner (signed in, or with the guest link), or an admin. */
export async function getTicketFor(req: Request, id: number, token: string | undefined) {
  const ticket = await loadTicket(id);
  const user = req.user;
  const allowed =
    ticket &&
    ((user && (ticket.userId === user.id || user.role === 'ADMIN')) ||
      (token && ticket.accessTokenHash && safeEqual(hashToken(token), ticket.accessTokenHash)));
  if (!ticket || !allowed) throw AppError.notFound('Ticket not found.');
  return ticket;
}

export async function replyToTicket(
  req: Request,
  id: number,
  token: string | undefined,
  input: unknown,
) {
  const { body } = ticketReplySchema.parse(input);
  const ticket = await getTicketFor(req, id, token);
  if (ticket.status === 'CLOSED')
    throw AppError.conflict('This ticket is closed. Please open a new one.');
  await prisma.$transaction([
    prisma.ticketMessage.create({
      data: { ticketId: id, authorId: req.user?.id ?? null, isStaff: false, body },
    }),
    prisma.supportTicket.update({ where: { id }, data: { status: 'OPEN' } }),
  ]);
  await notifyAdmins(id, `Reply on ticket #${id}`, ticket.subject);
  return getTicketFor(req, id, token);
}

export async function closeTicket(req: Request, id: number, token: string | undefined) {
  await getTicketFor(req, id, token);
  await prisma.supportTicket.update({ where: { id }, data: { status: 'CLOSED' } });
  return getTicketFor(req, id, token);
}

export async function myTickets(userId: number) {
  const rows = await prisma.supportTicket.findMany({
    where: { userId },
    orderBy: { updatedAt: 'desc' },
    take: 100,
  });
  return rows.map(toTicketSummary);
}
