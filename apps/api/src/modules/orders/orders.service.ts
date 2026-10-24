import type { Prisma } from '@prisma/client';
import {
  CURRENCIES,
  ORDER_TRANSITIONS,
  conversionFactor,
  convertMoney,
  formatMoney,
  orderActionSchema,
  placeOrderSchema,
  roundMoney,
  type CurrencyCode,
  type DeliveryMethod,
  type OrderAction,
  type OrderStatus,
} from '@tzed/shared';
import { prisma } from '../../db.js';
import { AppError } from '../../lib/errors.js';
import type { AuthUser } from '../../middleware/auth.js';
import { getCurrentRates } from '../geo/geo.service.js';
import { notify } from '../notifications/notifications.service.js';
import { orderInclude } from './order-dto.js';

const EVENT_FOR: Record<OrderAction, string> = {
  accept: 'accepted',
  decline: 'declined',
  ready: 'ready',
  received: 'received',
  'report-paid': 'buyer_paid',
  complete: 'completed',
  cancel: 'cancelled',
  'mark-paid': 'paid',
};

const fixed = (amount: number, currency: CurrencyCode) =>
  amount.toFixed(CURRENCIES[currency].minorUnits);

/** “Title”, or “Title” and N other items, for messages about an order. */
export function orderLabel(items: { titleSnapshot: string }[]) {
  const first = `“${items[0]?.titleSnapshot ?? ''}”`;
  const others = items.length - 1;
  return others > 0 ? `${first} and ${others} other item${others === 1 ? '' : 's'}` : first;
}

type ListingForOrder = Prisma.ListingGetPayload<{ include: { shipTo: true } }>;

/** Whether the seller offers this delivery method to a buyer in `buyerCountryId`. */
export function deliveryAllowed(
  listing: ListingForOrder,
  method: DeliveryMethod,
  buyerCountryId: number,
) {
  const sameCountry = listing.countryId === buyerCountryId;
  return (
    (method === 'PICKUP' && listing.deliveryPickup) ||
    (method === 'LOCAL' && listing.deliveryLocal && sameCountry) ||
    (method === 'CROSS_BORDER' && listing.deliveryCrossBorder && !sameCountry)
  );
}

/** Whether a buyer in `buyerCountryId` can order this listing at all. */
export function availableIn(listing: ListingForOrder, buyerCountryId: number) {
  return (
    listing.countryId === buyerCountryId ||
    listing.shipTo.some((s) => s.countryId === buyerCountryId)
  );
}

export function requireVerifiedEmail(user: AuthUser) {
  if (!user.emailVerifiedAt) {
    throw new AppError(
      403,
      'EMAIL_NOT_VERIFIED',
      'Please confirm your email address before ordering.',
    );
  }
}

/** The rate for converting `currency` to the buyer's currency, or an error if none is set. */
export async function rateFor(currency: CurrencyCode, buyerCurrency: CurrencyCode) {
  if (currency === buyerCurrency) return null;
  const rate = (await getCurrentRates()).find(
    (r) =>
      (r.base === currency && r.quote === buyerCurrency) ||
      (r.base === buyerCurrency && r.quote === currency),
  );
  if (!rate)
    throw new AppError(
      503,
      'RATE_UNAVAILABLE',
      'Ordering across the border is paused until the exchange rate is updated.',
    );
  return rate;
}

export interface OrderDraft {
  sellerId: number;
  currency: CurrencyCode;
  lines: { listing: ListingForOrder; quantity: number }[];
  deliveryMethod: DeliveryMethod;
  buyerNote: string | null;
}

/**
 * Creates one order (one seller, one or more items) inside a transaction: holds the stock
 * for every item, snapshots prices and the exchange rate, and records the "placed" event.
 * Throws a conflict if any item no longer has enough stock, so the whole transaction is
 * rolled back.
 */
export async function createOrderInTx(
  tx: Prisma.TransactionClient,
  user: AuthUser,
  draft: OrderDraft,
  rate: Awaited<ReturnType<typeof rateFor>>,
) {
  const { currency } = draft;
  const buyerCurrency = user.country.currencyCode as CurrencyCode;
  const lines = draft.lines.map(({ listing, quantity }) => {
    const unitPrice = listing.price.toNumber();
    return { listing, quantity, unitPrice, lineTotal: roundMoney(unitPrice * quantity, currency) };
  });
  const total = roundMoney(
    lines.reduce((sum, l) => sum + l.lineTotal, 0),
    currency,
  );
  const fxRate = rate ? conversionFactor(currency, buyerCurrency, rate) : 1;
  const buyerTotal = rate ? convertMoney(total, currency, buyerCurrency, rate) : total;

  for (const { listing, quantity } of lines) {
    // Hold the stock: only succeeds if enough is left (safe against two buyers at once).
    const { count } = await tx.listing.updateMany({
      where: { id: listing.id, status: 'ACTIVE', quantity: { gte: quantity } },
      data: { quantity: { decrement: quantity } },
    });
    if (count === 0) {
      const now = await tx.listing.findUnique({ where: { id: listing.id } });
      throw AppError.conflict(
        now?.status === 'ACTIVE' && now.quantity > 0
          ? `Only ${now.quantity} of “${listing.title}” left. Please lower the quantity.`
          : `Sorry, “${listing.title}” has just sold out.`,
      );
    }
    await tx.listing.updateMany({
      where: { id: listing.id, quantity: 0 },
      data: { status: 'SOLD' },
    });
  }

  const notes = [...new Set(lines.map((l) => l.listing.deliveryNotes).filter(Boolean))];
  return tx.order.create({
    data: {
      buyerId: user.id,
      sellerId: draft.sellerId,
      currency,
      total: fixed(total, currency),
      buyerCurrency,
      fxRate: fxRate.toFixed(8),
      buyerTotal: fixed(buyerTotal, buyerCurrency),
      deliveryMethod: draft.deliveryMethod,
      deliveryNotes: notes.length ? notes.join('\n').slice(0, 500) : null,
      buyerNote: draft.buyerNote,
      items: {
        create: lines.map((l) => ({
          listingId: l.listing.id,
          titleSnapshot: l.listing.title,
          unitPrice: fixed(l.unitPrice, currency),
          quantity: l.quantity,
          lineTotal: fixed(l.lineTotal, currency),
        })),
      },
      events: { create: { type: 'placed', actorId: user.id, note: draft.buyerNote } },
    },
    include: orderInclude,
  });
}

/** Tells the seller about a new order. */
export async function notifyNewOrder(
  user: AuthUser,
  order: Prisma.OrderGetPayload<{ include: typeof orderInclude }>,
) {
  const units = order.items.reduce((n, i) => n + i.quantity, 0);
  await notify(order.sellerId, {
    type: 'order.placed',
    title: 'New order',
    body: `${user.name} ordered ${order.items.length === 1 ? `${units} × ` : ''}${orderLabel(order.items)} (${formatMoney(order.total.toNumber(), order.currency as CurrencyCode)}). Accept or decline it.`,
    link: `/orders/${order.id}`,
    email: true,
  });
}

/** "Buy now": one listing, straight to an order. */
export async function placeOrder(user: AuthUser, input: unknown) {
  const data = placeOrderSchema.parse(input);
  requireVerifiedEmail(user);

  const listing = await prisma.listing.findUnique({
    where: { id: data.listingId },
    include: { shipTo: true },
  });
  if (!listing || listing.status !== 'ACTIVE') {
    throw AppError.conflict('This listing is no longer available.');
  }
  if (listing.sellerId === user.id) throw AppError.badRequest("You can't order your own listing.");
  if (!availableIn(listing, user.countryId)) {
    throw new AppError(
      400,
      'NOT_AVAILABLE_IN_COUNTRY',
      `This item isn't available to buyers in ${user.country.name}.`,
    );
  }
  if (!deliveryAllowed(listing, data.deliveryMethod, user.countryId)) {
    const message = 'The seller does not offer that delivery option for you.';
    throw AppError.badRequest(message, { fields: { deliveryMethod: message } });
  }

  const currency = listing.currency as CurrencyCode;
  const rate = await rateFor(currency, user.country.currencyCode as CurrencyCode);
  const order = await prisma.$transaction((tx) =>
    createOrderInTx(
      tx,
      user,
      {
        sellerId: listing.sellerId,
        currency,
        lines: [{ listing, quantity: data.quantity }],
        deliveryMethod: data.deliveryMethod,
        buyerNote: data.buyerNote,
      },
      rate,
    ),
  );
  await notifyNewOrder(user, order);
  return order;
}

/** Loads an order the user is part of (buyer or seller). */
export async function getOrderFor(user: AuthUser, id: number) {
  const order = await prisma.order.findUnique({ where: { id }, include: orderInclude });
  if (
    !order ||
    (order.buyerId !== user.id && order.sellerId !== user.id && user.role !== 'ADMIN')
  ) {
    throw AppError.notFound('Order not found.');
  }
  return order;
}

/** Puts held stock back when an order is declined or cancelled. */
async function releaseStock(
  tx: Prisma.TransactionClient,
  items: { listingId: number; quantity: number }[],
) {
  for (const item of items) {
    const listing = await tx.listing.findUnique({ where: { id: item.listingId } });
    if (!listing || listing.status === 'REMOVED') continue;
    // Relist items that sold out because of this order (not ones the seller marked sold).
    const reopen = listing.status === 'SOLD' && listing.quantity === 0;
    await tx.listing.update({
      where: { id: listing.id },
      data: { quantity: { increment: item.quantity }, ...(reopen ? { status: 'ACTIVE' } : {}) },
    });
  }
}

const MESSAGES: Record<
  OrderAction,
  (title: string, reason: string | null) => { title: string; body: string }
> = {
  accept: (t) => ({
    title: 'Order accepted',
    body: `The seller accepted your order for ${t}. You can now see their contact details.`,
  }),
  decline: (t, r) => ({
    title: 'Order declined',
    body: `The seller declined your order for ${t}.${r ? ` Reason: ${r}` : ''}`,
  }),
  received: (t) => ({
    title: 'Buyer received the item',
    body: `The buyer confirmed they received ${t}. You can now mark the order completed.`,
  }),
  'report-paid': (t) => ({
    title: 'Buyer says they paid',
    body: `The buyer says they have paid for ${t}. Check you received it, then record the payment.`,
  }),
  ready: (t) => ({ title: 'Order ready', body: `${t} is ready for collection or on its way.` }),
  complete: (t) => ({ title: 'Order completed', body: `The order for ${t} is complete.` }),
  cancel: (t, r) => ({
    title: 'Order cancelled',
    body: `The order for ${t} was cancelled.${r ? ` Reason: ${r}` : ''}`,
  }),
  'mark-paid': (t) => ({
    title: 'Payment recorded',
    body: `The seller recorded your payment for ${t}.`,
  }),
};

export async function changeOrder(user: AuthUser, id: number, action: OrderAction, input: unknown) {
  const order = await getOrderFor(user, id);
  const role = order.sellerId === user.id ? 'seller' : order.buyerId === user.id ? 'buyer' : null;
  const rule = ORDER_TRANSITIONS[action];
  if (!role || !rule[role]) throw AppError.forbidden('You can’t do that on this order.');

  const { reason } = orderActionSchema.parse(input ?? {});
  if (rule.needsReason && !reason) {
    const message = 'Please tell the buyer why.';
    throw AppError.badRequest(message, { fields: { reason: message } });
  }

  const now = new Date();
  const data: Prisma.OrderUpdateManyMutationInput =
    action === 'mark-paid'
      ? { paymentStatus: 'PAID_OFFLINE' }
      : action === 'report-paid'
        ? { buyerPaidAt: now }
        : action === 'received'
          ? { receivedAt: now }
          : {
              status: rule.to,
              ...(action === 'accept' ? { acceptedAt: now } : {}),
              ...(action === 'complete' ? { completedAt: now } : {}),
              ...(action === 'cancel' || action === 'decline'
                ? { cancelledAt: now, cancelReason: reason }
                : {}),
            };

  await prisma.$transaction(async (tx) => {
    // Conditional on the current status, so double clicks or both sides acting at once are safe.
    const { count } = await tx.order.updateMany({
      where: {
        id,
        status: { in: rule.from as OrderStatus[] },
        ...(action === 'mark-paid' ? { paymentStatus: 'UNPAID' } : {}),
        ...(action === 'report-paid' ? { paymentStatus: 'UNPAID', buyerPaidAt: null } : {}),
        // Once the buyer has the item, the order can't be cancelled, and receipt is confirmed once.
        ...(action === 'received' || action === 'cancel' ? { receivedAt: null } : {}),
      },
      data,
    });
    if (count === 0)
      throw AppError.conflict('This order has changed. Please refresh to see its current status.');
    if (action === 'cancel' || action === 'decline') await releaseStock(tx, order.items);
    await tx.orderEvent.create({
      data: { orderId: id, actorId: user.id, type: EVENT_FOR[action], note: reason },
    });
  });

  const other = role === 'seller' ? order.buyerId : order.sellerId;
  const message = MESSAGES[action](orderLabel(order.items), reason);
  await notify(other, {
    type: `order.${EVENT_FOR[action]}`,
    ...message,
    link: `/orders/${id}`,
    email: action !== 'mark-paid',
  });
  return getOrderFor(user, id);
}

export async function listOrders(user: AuthUser, role: 'buying' | 'selling', status?: OrderStatus) {
  const where: Prisma.OrderWhereInput = {
    ...(role === 'buying' ? { buyerId: user.id } : { sellerId: user.id }),
    ...(status ? { status } : {}),
  };
  const [orders, needsAction] = await Promise.all([
    prisma.order.findMany({
      where,
      include: orderInclude,
      orderBy: { createdAt: 'desc' },
      take: 100,
    }),
    prisma.order.count({ where: { sellerId: user.id, status: 'PLACED' } }),
  ]);
  return { orders, needsAction };
}
