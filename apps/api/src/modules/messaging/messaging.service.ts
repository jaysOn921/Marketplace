import type { Prisma } from '@prisma/client';
import {
  sendMessageSchema,
  startConversationSchema,
  type ConversationSummary,
  type CurrencyCode,
  type MessageDto,
} from '@tzed/shared';
import { prisma } from '../../db.js';
import { AppError } from '../../lib/errors.js';
import type { AuthUser } from '../../middleware/auth.js';
import { toImageDto } from '../listings/listing-dto.js';
import { notify } from '../notifications/notifications.service.js';

const PAGE = 50;

export const conversationInclude = {
  listing: { include: { images: { orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }], take: 1 } } },
  buyer: { select: { id: true, name: true, status: true } },
  seller: {
    select: { id: true, name: true, status: true, sellerProfile: { select: { shopName: true } } },
  },
  messages: { orderBy: { id: 'desc' }, take: 1 },
} satisfies Prisma.ConversationInclude;

type ConversationRow = Prisma.ConversationGetPayload<{ include: typeof conversationInclude }>;

function requireVerified(user: AuthUser) {
  if (!user.emailVerifiedAt) {
    throw new AppError(
      403,
      'EMAIL_NOT_VERIFIED',
      'Please confirm your email address before sending messages.',
    );
  }
}

const roleIn = (c: { sellerId: number }, userId: number) =>
  c.sellerId === userId ? 'seller' : 'buyer';
const lastReadOf = (
  c: { sellerId: number; buyerLastReadAt: Date | null; sellerLastReadAt: Date | null },
  userId: number,
) => (roleIn(c, userId) === 'seller' ? c.sellerLastReadAt : c.buyerLastReadAt);

/** Unread messages per conversation for this user (messages from the other side after their last read). */
async function unreadCounts(userId: number, conversations: ConversationRow[]) {
  const counts = await Promise.all(
    conversations.map((c) =>
      prisma.message.count({
        where: {
          conversationId: c.id,
          senderId: { not: userId },
          ...(lastReadOf(c, userId) ? { createdAt: { gt: lastReadOf(c, userId)! } } : {}),
        },
      }),
    ),
  );
  return new Map(conversations.map((c, i) => [c.id, counts[i]!]));
}

export function toConversationSummary(
  c: ConversationRow,
  userId: number,
  unread: number,
): ConversationSummary {
  const role = roleIn(c, userId);
  const last = c.messages[0];
  const image = c.listing.images[0];
  return {
    id: c.id,
    listing: {
      id: c.listing.id,
      title: c.listing.title,
      price: c.listing.price.toNumber(),
      currency: c.listing.currency as CurrencyCode,
      coverImage: image ? toImageDto(image) : null,
    },
    role,
    otherParty:
      role === 'buyer' ? (c.seller.sellerProfile?.shopName ?? c.seller.name) : c.buyer.name,
    lastMessage: last
      ? {
          body: last.body.slice(0, 140),
          mine: last.senderId === userId,
          createdAt: last.createdAt.toISOString(),
        }
      : null,
    unread,
    lastMessageAt: c.lastMessageAt.toISOString(),
  };
}

export async function listConversations(user: AuthUser) {
  const rows = await prisma.conversation.findMany({
    where: { OR: [{ buyerId: user.id }, { sellerId: user.id }] },
    include: conversationInclude,
    orderBy: { lastMessageAt: 'desc' },
    take: 100,
  });
  const unread = await unreadCounts(user.id, rows);
  const conversations = rows.map((c) => toConversationSummary(c, user.id, unread.get(c.id) ?? 0));
  return { conversations, unread: conversations.reduce((n, c) => n + c.unread, 0) };
}

export async function totalUnread(userId: number) {
  const rows = await prisma.conversation.findMany({
    where: { OR: [{ buyerId: userId }, { sellerId: userId }] },
    include: conversationInclude,
  });
  const unread = await unreadCounts(userId, rows);
  return [...unread.values()].reduce((a, b) => a + b, 0);
}

async function getConversationFor(user: AuthUser, id: number) {
  const c = await prisma.conversation.findUnique({ where: { id }, include: conversationInclude });
  if (!c || (c.buyerId !== user.id && c.sellerId !== user.id))
    throw AppError.notFound('Conversation not found.');
  return c;
}

/** Saves a message, bumps the conversation and tells the other person. */
async function addMessage(user: AuthUser, c: ConversationRow, body: string) {
  const other = c.buyerId === user.id ? c.seller : c.buyer;
  if (other.status !== 'ACTIVE')
    throw AppError.conflict('This person can no longer receive messages.');

  // Email only when this is the first unread message for them, so a chat doesn't flood their inbox.
  const theirLastRead = c.sellerId === other.id ? c.sellerLastReadAt : c.buyerLastReadAt;
  const alreadyUnread = await prisma.message.count({
    where: {
      conversationId: c.id,
      senderId: user.id,
      ...(theirLastRead ? { createdAt: { gt: theirLastRead } } : {}),
    },
  });

  const now = new Date();
  const message = await prisma.$transaction(async (tx) => {
    const m = await tx.message.create({ data: { conversationId: c.id, senderId: user.id, body } });
    // Sending a message means you've read the conversation.
    await tx.conversation.update({
      where: { id: c.id },
      data: {
        lastMessageAt: now,
        ...(c.sellerId === user.id ? { sellerLastReadAt: now } : { buyerLastReadAt: now }),
      },
    });
    return m;
  });

  const senderName =
    c.sellerId === user.id ? (c.seller.sellerProfile?.shopName ?? user.name) : user.name;
  await notify(other.id, {
    type: 'message.new',
    title: `New message from ${senderName}`,
    body: `About “${c.listing.title}”: ${body.length > 200 ? `${body.slice(0, 200)}…` : body}`,
    link: `/messages/${c.id}`,
    email: alreadyUnread === 0,
    actionLabel: 'Reply',
  });
  return message;
}

/**
 * Starts or continues a conversation about a listing. Buyers write about any visible listing;
 * sellers can write first only to someone who has ordered that listing from them.
 */
export async function startConversation(user: AuthUser, input: unknown) {
  requireVerified(user);
  const data = startConversationSchema.parse(input);
  const listing = await prisma.listing.findUnique({ where: { id: data.listingId } });
  if (!listing || !['ACTIVE', 'SOLD'].includes(listing.status)) {
    if (!listing || listing.sellerId !== user.id)
      throw AppError.notFound('This listing is not available.');
  }

  let buyerId: number;
  if (listing!.sellerId === user.id) {
    if (!data.buyerId) throw AppError.badRequest('Choose who to write to.');
    const ordered = await prisma.order.count({
      where: {
        sellerId: user.id,
        buyerId: data.buyerId,
        items: { some: { listingId: listing!.id } },
      },
    });
    if (!ordered)
      throw AppError.forbidden('You can only message buyers who have ordered this listing.');
    buyerId = data.buyerId;
  } else {
    buyerId = user.id;
  }

  const conversation = await prisma.conversation.upsert({
    where: { listingId_buyerId: { listingId: listing!.id, buyerId } },
    update: {},
    create: { listingId: listing!.id, buyerId, sellerId: listing!.sellerId },
    include: conversationInclude,
  });
  await addMessage(user, conversation, data.body);
  return conversation.id;
}

export async function sendMessage(user: AuthUser, id: number, input: unknown) {
  requireVerified(user);
  const { body } = sendMessageSchema.parse(input);
  const c = await getConversationFor(user, id);
  return addMessage(user, c, body);
}

/** A conversation's messages (newest page, or older ones before a message id). Marks it read. */
export async function readConversation(user: AuthUser, id: number, before?: number) {
  const c = await getConversationFor(user, id);
  const rows = await prisma.message.findMany({
    where: { conversationId: id, ...(before ? { id: { lt: before } } : {}) },
    orderBy: { id: 'desc' },
    take: PAGE + 1,
  });
  if (!before) {
    await prisma.conversation.update({
      where: { id },
      data:
        c.sellerId === user.id ? { sellerLastReadAt: new Date() } : { buyerLastReadAt: new Date() },
    });
  }
  const other = c.buyerId === user.id ? c.seller : c.buyer;
  const order = await prisma.order.findFirst({
    where: {
      buyerId: c.buyerId,
      sellerId: c.sellerId,
      items: { some: { listingId: c.listingId } },
    },
    orderBy: { createdAt: 'desc' },
    select: { id: true },
  });
  const messages: MessageDto[] = rows
    .slice(0, PAGE)
    .reverse()
    .map((m) => ({
      id: m.id,
      body: m.body,
      mine: m.senderId === user.id,
      createdAt: m.createdAt.toISOString(),
    }));
  return {
    conversation: {
      ...toConversationSummary(c, user.id, 0),
      canReply: other.status === 'ACTIVE',
      orderId: order?.id ?? null,
    },
    messages,
    hasMore: rows.length > PAGE,
  };
}
