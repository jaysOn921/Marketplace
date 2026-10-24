import type { Prisma } from '@prisma/client';
import {
  CART_MAX_ITEMS,
  CART_MAX_QUANTITY,
  DELIVERY_METHODS,
  addToCartSchema,
  checkoutSchema,
  convertMoney,
  roundMoney,
  updateCartItemSchema,
  type CartGroup,
  type CartLine,
  type CartProblem,
  type CartResponse,
  type CountryCode,
  type CurrencyCode,
  type DeliveryMethod,
  type ExchangeRateInfo,
} from '@tzed/shared';
import { prisma } from '../../db.js';
import { AppError } from '../../lib/errors.js';
import type { AuthUser } from '../../middleware/auth.js';
import { recordListingStat } from '../analytics/listing-stats.js';
import { getCurrentRates } from '../geo/geo.service.js';
import { toImageDto } from '../listings/listing-dto.js';
import {
  availableIn,
  createOrderInTx,
  deliveryAllowed,
  notifyNewOrder,
  rateFor,
  type OrderDraft,
  requireVerifiedEmail,
} from '../orders/orders.service.js';

const cartInclude = {
  listing: {
    include: {
      shipTo: true,
      images: { orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }], take: 1 },
      seller: { include: { country: true, sellerProfile: true } },
    },
  },
} satisfies Prisma.CartItemInclude;
type CartRow = Prisma.CartItemGetPayload<{ include: typeof cartInclude }>;

function problemOf(row: CartRow, user: AuthUser): CartProblem | null {
  const { listing } = row;
  if (listing.status !== 'ACTIVE' || listing.seller.status !== 'ACTIVE') return 'UNAVAILABLE';
  if (!availableIn(listing, user.countryId)) return 'NOT_IN_YOUR_COUNTRY';
  if (listing.quantity < row.quantity) return 'NOT_ENOUGH_STOCK';
  return null;
}

/** Delivery methods every given listing offers to this buyer. */
function sharedDeliveryMethods(rows: CartRow[], buyerCountryId: number): DeliveryMethod[] {
  return DELIVERY_METHODS.filter((m) =>
    rows.every((r) => deliveryAllowed(r.listing, m, buyerCountryId)),
  );
}

function convert(amount: number, from: CurrencyCode, to: CurrencyCode, rate?: ExchangeRateInfo) {
  if (from === to) return amount;
  return rate ? convertMoney(amount, from, to, rate) : null;
}

async function loadRows(userId: number) {
  return prisma.cartItem.findMany({
    where: { userId },
    include: cartInclude,
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  });
}

/** The cart, grouped by seller (one order per seller at checkout). */
export async function getCart(user: AuthUser): Promise<CartResponse> {
  const rows = await loadRows(user.id);
  const buyerCurrency = user.country.currencyCode as CurrencyCode;
  const rate = (await getCurrentRates()).find((r) => r.base === 'ZMW' && r.quote === 'TZS');

  const bySeller = new Map<number, CartRow[]>();
  for (const row of rows) {
    const list = bySeller.get(row.listing.sellerId) ?? [];
    list.push(row);
    bySeller.set(row.listing.sellerId, list);
  }

  let total: number | null = 0;
  const groups: CartGroup[] = [...bySeller.values()].map((sellerRows) => {
    const seller = sellerRows[0]!.listing.seller;
    const currency = sellerRows[0]!.listing.currency as CurrencyCode;
    const items: CartLine[] = sellerRows.map((row) => {
      const unitPrice = row.listing.price.toNumber();
      const image = row.listing.images[0];
      return {
        listingId: row.listingId,
        title: row.listing.title,
        coverImage: image ? toImageDto(image) : null,
        unitPrice,
        quantity: row.quantity,
        available: row.listing.status === 'ACTIVE' ? row.listing.quantity : 0,
        lineTotal: roundMoney(unitPrice * row.quantity, currency),
        problem: problemOf(row, user),
      };
    });
    const orderable = sellerRows.filter((r) => !problemOf(r, user));
    const subtotal = roundMoney(
      items.filter((i) => !i.problem).reduce((sum, i) => sum + i.lineTotal, 0),
      currency,
    );
    const buyerSubtotal = convert(subtotal, currency, buyerCurrency, rate);
    total = total === null || buyerSubtotal === null ? null : total + buyerSubtotal;
    return {
      seller: {
        id: seller.id,
        name: seller.name,
        shopName: seller.sellerProfile?.shopName ?? null,
        shopSlug: seller.sellerProfile?.slug ?? null,
        countryCode: seller.country.code as CountryCode,
        town: seller.sellerProfile?.town ?? null,
      },
      currency,
      items,
      subtotal,
      buyerSubtotal,
      deliveryMethods: orderable.length ? sharedDeliveryMethods(orderable, user.countryId) : [],
    };
  });

  return {
    groups,
    buyerCurrency,
    total: total === null ? null : roundMoney(total, buyerCurrency),
    count: rows.reduce((n, r) => n + r.quantity, 0),
  };
}

/** Adds a listing (or more of it) to the cart. */
export async function addToCart(user: AuthUser, input: unknown) {
  const data = addToCartSchema.parse(input);
  const listing = await prisma.listing.findUnique({
    where: { id: data.listingId },
    include: { shipTo: true },
  });
  if (!listing || listing.status !== 'ACTIVE') {
    throw AppError.conflict('This listing is no longer available.');
  }
  if (listing.sellerId === user.id) throw AppError.badRequest("You can't buy your own listing.");
  if (!availableIn(listing, user.countryId)) {
    throw new AppError(
      400,
      'NOT_AVAILABLE_IN_COUNTRY',
      `This item isn't available to buyers in ${user.country.name}.`,
    );
  }

  const existing = await prisma.cartItem.findUnique({
    where: { userId_listingId: { userId: user.id, listingId: listing.id } },
  });
  if (
    !existing &&
    (await prisma.cartItem.count({ where: { userId: user.id } })) >= CART_MAX_ITEMS
  ) {
    throw AppError.conflict(
      `Your cart can hold ${CART_MAX_ITEMS} different items. Check out or remove some first.`,
    );
  }
  const quantity = (existing?.quantity ?? 0) + data.quantity;
  if (quantity > listing.quantity) {
    throw AppError.conflict(
      listing.quantity === (existing?.quantity ?? 0)
        ? `You already have all ${listing.quantity} available in your cart.`
        : `Only ${listing.quantity} available${existing ? ` (${existing.quantity} already in your cart)` : ''}.`,
    );
  }
  if (quantity > CART_MAX_QUANTITY) {
    throw AppError.badRequest(`At most ${CART_MAX_QUANTITY} of one item per order.`);
  }

  await prisma.cartItem.upsert({
    where: { userId_listingId: { userId: user.id, listingId: listing.id } },
    create: { userId: user.id, listingId: listing.id, quantity },
    update: { quantity },
  });
  await recordListingStat(listing.id, 'cartAdds');
  return getCart(user);
}

export async function updateCartItem(user: AuthUser, listingId: number, input: unknown) {
  const { quantity } = updateCartItemSchema.parse(input);
  const row = await prisma.cartItem.findUnique({
    where: { userId_listingId: { userId: user.id, listingId } },
    include: { listing: true },
  });
  if (!row) throw AppError.notFound('That item is not in your cart.');
  if (quantity > row.listing.quantity && quantity > row.quantity) {
    throw AppError.conflict(`Only ${row.listing.quantity} available.`);
  }
  await prisma.cartItem.update({ where: { id: row.id }, data: { quantity } });
  return getCart(user);
}

export async function removeCartItem(user: AuthUser, listingId: number) {
  await prisma.cartItem.deleteMany({ where: { userId: user.id, listingId } });
  return getCart(user);
}

/**
 * Places one order per chosen seller from the cart, all or nothing: if any item can't be
 * ordered (sold out, delivery option not offered…) no order is created. The ordered items
 * leave the cart; items from other sellers stay.
 */
export async function checkout(user: AuthUser, input: unknown) {
  const data = checkoutSchema.parse(input);
  requireVerifiedEmail(user);
  const sellerIds = data.orders.map((o) => o.sellerId);
  if (new Set(sellerIds).size !== sellerIds.length) {
    throw AppError.badRequest('Each seller can only appear once.');
  }

  const rows = await loadRows(user.id);
  const buyerCurrency = user.country.currencyCode as CurrencyCode;
  const drafts: {
    draft: OrderDraft;
    rate: Awaited<ReturnType<typeof rateFor>>;
    cartIds: number[];
  }[] = [];
  for (const choice of data.orders) {
    const sellerRows = rows.filter((r) => r.listing.sellerId === choice.sellerId);
    if (!sellerRows.length) {
      throw AppError.conflict('Your cart has changed. Please review it and try again.');
    }
    const shop = sellerRows[0]!.listing.seller.sellerProfile?.shopName ?? 'this seller';
    const problem = sellerRows.find((r) => problemOf(r, user));
    if (problem) {
      throw AppError.conflict(
        `“${problem.listing.title}” from ${shop} can't be ordered as it is. Update your cart first.`,
      );
    }
    if (
      !sellerRows.every((r) => deliveryAllowed(r.listing, choice.deliveryMethod, user.countryId))
    ) {
      const message = `${shop} doesn't offer that delivery option for every item.`;
      throw AppError.badRequest(message, { fields: { deliveryMethod: message } });
    }
    const currency = sellerRows[0]!.listing.currency as CurrencyCode;
    drafts.push({
      draft: {
        sellerId: choice.sellerId,
        currency,
        lines: sellerRows.map((r) => ({ listing: r.listing, quantity: r.quantity })),
        deliveryMethod: choice.deliveryMethod,
        buyerNote: choice.buyerNote,
      },
      rate: await rateFor(currency, buyerCurrency),
      cartIds: sellerRows.map((r) => r.id),
    });
  }

  const orders = await prisma.$transaction(async (tx) => {
    const created = [];
    for (const { draft, rate, cartIds } of drafts) {
      created.push(await createOrderInTx(tx, user, draft, rate));
      await tx.cartItem.deleteMany({ where: { id: { in: cartIds } } });
    }
    return created;
  });
  for (const order of orders) await notifyNewOrder(user, order);
  return { orderIds: orders.map((o) => o.id) };
}
