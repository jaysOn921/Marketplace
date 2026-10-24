import type { Prisma } from '@prisma/client';
import type { Request } from 'express';
import {
  disputeMessageSchema,
  openDisputeSchema,
  resolveDisputeSchema,
  type AdminDisputeRow,
  type DisputeDto,
  type DisputeReason,
  type Paged,
} from '@tzed/shared';
import { prisma } from '../../db.js';
import { AppError } from '../../lib/errors.js';
import type { AuthUser } from '../../middleware/auth.js';
import { recordAudit } from '../audit/audit.service.js';
import { notify } from '../notifications/notifications.service.js';
import { getOrderFor, orderLabel } from '../orders/orders.service.js';

const PAGE = 25;
const REASON_TEXT: Record<DisputeReason, string> = {
  NOT_RECEIVED: 'item not received',
  NOT_AS_DESCRIBED: 'item not as described',
  DAMAGED: 'item damaged',
  PAYMENT: 'payment problem',
  NO_RESPONSE: 'the other person stopped responding',
  OTHER: 'other',
};

const disputeInclude = {
  order: {
    include: { items: { take: 1 }, buyer: true, seller: { include: { sellerProfile: true } } },
  },
  messages: { orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], include: { author: true } },
} satisfies Prisma.OrderDisputeInclude;
type DisputeRow = Prisma.OrderDisputeGetPayload<{ include: typeof disputeInclude }>;

const shortName = (name: string) => name.split(/\s+/)[0] ?? name;

function toDto(d: DisputeRow): DisputeDto {
  const side = (id: number) =>
    id === d.order.buyerId ? 'buyer' : id === d.order.sellerId ? 'seller' : 'tzed';
  return {
    id: d.id,
    orderId: d.orderId,
    status: d.status,
    reason: d.reason,
    openedBy: d.openedById === d.order.sellerId ? 'seller' : 'buyer',
    resolution: d.resolution,
    resolvedAt: d.resolvedAt?.toISOString() ?? null,
    createdAt: d.createdAt.toISOString(),
    messages: d.messages.map((m) => {
      const author = side(m.authorId);
      return {
        id: m.id,
        author,
        authorName:
          author === 'tzed'
            ? 'TZed support'
            : author === 'seller'
              ? (d.order.seller.sellerProfile?.shopName ?? shortName(m.author.name))
              : shortName(m.author.name),
        body: m.body,
        createdAt: m.createdAt.toISOString(),
      };
    }),
  };
}

async function admins() {
  return prisma.user.findMany({ where: { role: 'ADMIN', status: 'ACTIVE' }, select: { id: true } });
}

/** The buyer or seller raises a problem on their order. */
export async function openDispute(user: AuthUser, orderId: number, input: unknown, req: Request) {
  const data = openDisputeSchema.parse(input);
  const order = await getOrderFor(user, orderId);
  const role = order.buyerId === user.id ? 'buyer' : order.sellerId === user.id ? 'seller' : null;
  if (!role)
    throw AppError.forbidden('Only the buyer or seller can report a problem with an order.');
  if (await prisma.orderDispute.findFirst({ where: { orderId, status: 'OPEN' } })) {
    throw AppError.conflict('There is already an open problem on this order. Add to it below.');
  }

  const dispute = await prisma.$transaction(async (tx) => {
    const d = await tx.orderDispute.create({
      data: {
        orderId,
        openedById: user.id,
        reason: data.reason,
        messages: { create: { authorId: user.id, body: data.details } },
      },
    });
    await tx.orderEvent.create({
      data: { orderId, actorId: user.id, type: 'dispute_opened', note: REASON_TEXT[data.reason] },
    });
    await recordAudit(
      {
        action: 'dispute.open',
        targetType: 'order',
        targetId: orderId,
        after: { disputeId: d.id, reason: data.reason, by: role },
        req,
      },
      tx,
    );
    return d;
  });

  const label = orderLabel(order.items);
  await notify(role === 'buyer' ? order.sellerId : order.buyerId, {
    type: 'dispute.opened',
    title: `Problem reported on order #${orderId}`,
    body: `The ${role} reported a problem with ${label} (${REASON_TEXT[data.reason]}). The TZed team will help sort it out. Reply on the order page.`,
    link: `/orders/${orderId}#problem`,
    email: true,
  });
  for (const a of await admins()) {
    await notify(a.id, {
      type: 'dispute.new',
      title: `New problem on order #${orderId}`,
      body: `The ${role} reported: ${REASON_TEXT[data.reason]}.`,
      link: `/admin/disputes/${dispute.id}`,
    });
  }
  return getDispute(user, orderId);
}

/** The latest problem on an order, for its buyer, seller or an admin. */
export async function getDispute(user: AuthUser, orderId: number) {
  await getOrderFor(user, orderId); // checks access
  const d = await prisma.orderDispute.findFirst({
    where: { orderId },
    orderBy: { createdAt: 'desc' },
    include: disputeInclude,
  });
  return d ? toDto(d) : null;
}

async function loadForParticipant(user: AuthUser, disputeId: number) {
  const d = await prisma.orderDispute.findUnique({
    where: { id: disputeId },
    include: disputeInclude,
  });
  const allowed =
    d && (user.role === 'ADMIN' || d.order.buyerId === user.id || d.order.sellerId === user.id);
  if (!d || !allowed) throw AppError.notFound('Problem not found.');
  return d;
}

export async function addMessage(user: AuthUser, disputeId: number, input: unknown) {
  const { body } = disputeMessageSchema.parse(input);
  const d = await loadForParticipant(user, disputeId);
  if (d.status !== 'OPEN') throw AppError.conflict('This problem has been resolved.');
  await prisma.$transaction([
    prisma.disputeMessage.create({ data: { disputeId, authorId: user.id, body } }),
    // Moves it up the admin queue.
    prisma.orderDispute.update({ where: { id: disputeId }, data: { updatedAt: new Date() } }),
  ]);
  const fromTzed = user.id !== d.order.buyerId && user.id !== d.order.sellerId;
  for (const id of [d.order.buyerId, d.order.sellerId].filter((id) => id !== user.id)) {
    await notify(id, {
      type: 'dispute.message',
      title: fromTzed
        ? `TZed support replied about order #${d.orderId}`
        : `New reply about the problem on order #${d.orderId}`,
      body: body.length > 200 ? `${body.slice(0, 200)}…` : body,
      link: `/orders/${d.orderId}#problem`,
      email: fromTzed,
    });
  }
  return toDto(await loadForParticipant(user, disputeId));
}

// ─── Admin ───────────────────────────────────────────────────────────────────

export async function adminListDisputes(
  query: Record<string, unknown>,
): Promise<Paged<AdminDisputeRow>> {
  const page = Math.max(1, Math.min(Number(query.page) || 1, 1000));
  const status =
    query.status === 'RESOLVED' ? 'RESOLVED' : query.status === 'ALL' ? undefined : 'OPEN';
  const where: Prisma.OrderDisputeWhereInput = status ? { status } : {};
  const [rows, total] = await Promise.all([
    prisma.orderDispute.findMany({
      where,
      include: { ...disputeInclude, _count: { select: { messages: true } } },
      orderBy: [{ status: 'asc' }, { updatedAt: 'desc' }],
      skip: (page - 1) * PAGE,
      take: PAGE,
    }),
    prisma.orderDispute.count({ where }),
  ]);
  return {
    rows: rows.map((d) => ({
      id: d.id,
      orderId: d.orderId,
      status: d.status,
      reason: d.reason,
      openedBy: d.openedById === d.order.sellerId ? 'seller' : 'buyer',
      buyerName: d.order.buyer.name,
      sellerName: d.order.seller.sellerProfile?.shopName ?? d.order.seller.name,
      orderTitle: d.order.items[0]?.titleSnapshot ?? '',
      messages: d._count.messages,
      createdAt: d.createdAt.toISOString(),
      updatedAt: d.updatedAt.toISOString(),
    })),
    total,
    page,
    pageCount: Math.max(1, Math.ceil(total / PAGE)),
  };
}

export async function adminGetDispute(admin: AuthUser, disputeId: number) {
  return toDto(await loadForParticipant(admin, disputeId));
}

export async function resolveDispute(
  admin: AuthUser,
  disputeId: number,
  input: unknown,
  req: Request,
) {
  const { resolution } = resolveDisputeSchema.parse(input);
  const d = await loadForParticipant(admin, disputeId);
  await prisma.$transaction(async (tx) => {
    const { count } = await tx.orderDispute.updateMany({
      where: { id: disputeId, status: 'OPEN' },
      data: { status: 'RESOLVED', resolution, resolvedById: admin.id, resolvedAt: new Date() },
    });
    if (count === 0) throw AppError.conflict('This problem has already been resolved.');
    await tx.orderEvent.create({
      data: { orderId: d.orderId, actorId: admin.id, type: 'dispute_resolved', note: resolution },
    });
    await recordAudit(
      {
        action: 'dispute.resolve',
        targetType: 'order',
        targetId: d.orderId,
        after: { disputeId, resolution },
        req,
      },
      tx,
    );
  });
  for (const id of [d.order.buyerId, d.order.sellerId]) {
    await notify(id, {
      type: 'dispute.resolved',
      title: `Problem on order #${d.orderId} resolved`,
      body: `The TZed team has resolved the problem: ${resolution}`,
      link: `/orders/${d.orderId}#problem`,
      email: true,
    });
  }
  return adminGetDispute(admin, disputeId);
}

export const openDisputeCount = () => prisma.orderDispute.count({ where: { status: 'OPEN' } });
