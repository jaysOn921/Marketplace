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

export async function placeOrder(user: AuthUser, input: unknown) {
  const data = placeOrderSchema.parse(input);
  if (!user.emailVerifiedAt) {
    throw new AppError(
      403,
      'EMAIL_NOT_VERIFIED',
      'Please confirm your email address before ordering.',
    );
  }

  const listing = await prisma.listing.findUnique({
    where: { id: data.listingId },
    include: { shipTo: true, country: true },
  });
  if (!listing || listing.status !== 'ACTIVE') {
    throw AppError.conflict('This listing is no longer available.');
  }
  if (listing.sellerId === user.id) throw AppError.badRequest("You can't order your own listing.");

  const sameCountry = listing.countryId === user.countryId;
  if (!sameCountry && !listing.shipTo.some((s) => s.countryId === user.countryId)) {
    throw new AppError(
      400,
      'NOT_AVAILABLE_IN_COUNTRY',
      `This item isn't available to buyers in ${user.country.name}.`,
    );
  }
  const allowed =
    (data.deliveryMethod === 'PICKUP' && listing.deliveryPickup) ||
    (data.deliveryMethod === 'LOCAL' && listing.deliveryLocal && sameCountry) ||
    (data.deliveryMethod === 'CROSS_BORDER' && listing.deliveryCrossBorder && !sameCountry);
  if (!allowed) {
    const message = 'The seller does not offer that delivery option for you.';
    throw AppError.badRequest(message, { fields: { deliveryMethod: message } });
  }

  // Price snapshot in the seller's currency and the buyer's, with the rate used.
  const currency = listing.currency as CurrencyCode;
  const buyerCurrency = user.country.currencyCode as CurrencyCode;
  const unitPrice = listing.price.toNumber();
  const total = roundMoney(unitPrice * data.quantity, currency);
  let fxRate = 1;
  let buyerTotal = total;
  if (buyerCurrency !== currency) {
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
    fxRate = conversionFactor(currency, buyerCurrency, rate);
    buyerTotal = convertMoney(total, currency, buyerCurrency, rate);
  }

  const order = await prisma.$transaction(async (tx) => {
    // Hold the stock: only succeeds if enough is left (safe against two buyers at once).
    const { count } = await tx.listing.updateMany({
      where: { id: listing.id, status: 'ACTIVE', quantity: { gte: data.quantity } },
      data: { quantity: { decrement: data.quantity } },
    });
    if (count === 0) {
      const now = await tx.listing.findUnique({ where: { id: listing.id } });
      throw AppError.conflict(
        now?.status === 'ACTIVE' && now.quantity > 0
          ? `Only ${now.quantity} left. Please lower the quantity.`
          : 'Sorry, this item has just sold out.',
      );
    }
    await tx.listing.updateMany({
      where: { id: listing.id, quantity: 0 },
      data: { status: 'SOLD' },
    });

    return tx.order.create({
      data: {
        buyerId: user.id,
        sellerId: listing.sellerId,
        currency,
        total: fixed(total, currency),
        buyerCurrency,
        fxRate: fxRate.toFixed(8),
        buyerTotal: fixed(buyerTotal, buyerCurrency),
        deliveryMethod: data.deliveryMethod,
        deliveryNotes: listing.deliveryNotes,
        buyerNote: data.buyerNote,
        items: {
          create: {
            listingId: listing.id,
            titleSnapshot: listing.title,
            unitPrice: fixed(unitPrice, currency),
            quantity: data.quantity,
            lineTotal: fixed(total, currency),
          },
        },
        events: { create: { type: 'placed', actorId: user.id, note: data.buyerNote } },
      },
      include: orderInclude,
    });
  });

  await notify(listing.sellerId, {
    type: 'order.placed',
    title: 'New order',
    body: `${user.name} ordered ${data.quantity} × “${listing.title}” (${formatMoney(total, currency)}). Accept or decline it.`,
    link: `/orders/${order.id}`,
    email: true,
  });
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
    body: `The seller accepted your order for “${t}”. You can now see their contact details.`,
  }),
  decline: (t, r) => ({
    title: 'Order declined',
    body: `The seller declined your order for “${t}”.${r ? ` Reason: ${r}` : ''}`,
  }),
  received: (t) => ({
    title: 'Buyer received the item',
    body: `The buyer confirmed they received “${t}”. You can now mark the order completed.`,
  }),
  'report-paid': (t) => ({
    title: 'Buyer says they paid',
    body: `The buyer says they have paid for “${t}”. Check you received it, then record the payment.`,
  }),
  ready: (t) => ({ title: 'Order ready', body: `“${t}” is ready for collection or on its way.` }),
  complete: (t) => ({ title: 'Order completed', body: `The order for “${t}” is complete.` }),
  cancel: (t, r) => ({
    title: 'Order cancelled',
    body: `The order for “${t}” was cancelled.${r ? ` Reason: ${r}` : ''}`,
  }),
  'mark-paid': (t) => ({
    title: 'Payment recorded',
    body: `The seller recorded your payment for “${t}”.`,
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
  const message = MESSAGES[action](order.items[0]!.titleSnapshot, reason);
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
