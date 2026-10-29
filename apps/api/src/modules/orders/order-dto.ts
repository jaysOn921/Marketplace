import type { Prisma } from '@prisma/client';
import {
  availableOrderActions,
  type CountryCode,
  type CurrencyCode,
  type OrderDetail,
  type OrderParty,
  type OrderSummary,
} from '@tzed/shared';
import { toImageDto } from '../listings/listing-dto.js';

const party = { include: { country: true, sellerProfile: true } } as const;

export const orderInclude = {
  buyer: party,
  seller: party,
  items: {
    orderBy: { id: 'asc' },
    include: {
      listing: { include: { images: { orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }], take: 1 } } },
    },
  },
  events: { orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] },
  review: true,
  disputes: { orderBy: { createdAt: 'desc' }, take: 1 },
} satisfies Prisma.OrderInclude;

type OrderRow = Prisma.OrderGetPayload<{ include: typeof orderInclude }>;
type PartyRow = OrderRow['buyer'];

/** Contact details are shared once the seller has accepted (and not after a cancellation). */
const CONTACT_VISIBLE = new Set(['ACCEPTED', 'READY', 'COMPLETED']);

function roleOf(order: OrderRow, viewerId: number): 'buyer' | 'seller' {
  return order.sellerId === viewerId ? 'seller' : 'buyer';
}

export function toOrderSummary(order: OrderRow, viewerId: number): OrderSummary {
  const role = roleOf(order, viewerId);
  const item = order.items[0]!;
  const image = item.listing.images[0];
  const other = role === 'buyer' ? order.seller : order.buyer;
  return {
    id: order.id,
    status: order.status,
    paymentStatus: order.paymentStatus,
    role,
    title: item.titleSnapshot,
    quantity: order.items.reduce((n, i) => n + i.quantity, 0),
    itemCount: order.items.length,
    currency: order.currency as CurrencyCode,
    total: order.total.toNumber(),
    buyerCurrency: order.buyerCurrency as CurrencyCode,
    buyerTotal: order.buyerTotal.toNumber(),
    deliveryMethod: order.deliveryMethod,
    coverImage: image ? toImageDto(image) : null,
    otherParty: role === 'buyer' ? (other.sellerProfile?.shopName ?? other.name) : other.name,
    createdAt: order.createdAt.toISOString(),
    updatedAt: order.updatedAt.toISOString(),
  };
}

function toParty(p: PartyRow, showPhone: boolean, asSeller: boolean): OrderParty {
  const sp = p.sellerProfile;
  // Numbers are only shared by choice: sellers through their contact preference, buyers
  // with "share my number on orders". Otherwise the two talk in TZed messages.
  const phoneAllowed = asSeller
    ? sp?.contactPreference === 'PHONE' || sp?.contactPreference === 'BOTH'
    : p.sharePhoneOnOrders;
  return {
    id: p.id,
    name: p.name,
    countryCode: p.country.code as CountryCode,
    phone: showPhone && phoneAllowed ? p.phone : null,
    ...(asSeller && sp ? { shopName: sp.shopName, shopSlug: sp.slug } : {}),
  };
}

export function toOrderDetail(
  order: OrderRow,
  viewerId: number,
  conversationId: number | null = null,
): OrderDetail {
  const summary = toOrderSummary(order, viewerId);
  const item = order.items[0]!;
  const showPhone = CONTACT_VISIBLE.has(order.status);
  return {
    ...summary,
    dispute: order.disputes[0]
      ? {
          id: order.disputes[0].id,
          status: order.disputes[0].status,
          reason: order.disputes[0].reason,
        }
      : null,
    canDispute:
      (viewerId === order.buyerId || viewerId === order.sellerId) &&
      order.disputes[0]?.status !== 'OPEN',
    deliveryDays:
      order.deliveryDaysMin !== null && order.deliveryDaysMax !== null
        ? { min: order.deliveryDaysMin, max: order.deliveryDaysMax }
        : null,
    listingId: item.listingId,
    unitPrice: item.unitPrice.toNumber(),
    items: order.items.map((i) => ({
      listingId: i.listingId,
      title: i.titleSnapshot,
      unitPrice: i.unitPrice.toNumber(),
      quantity: i.quantity,
      lineTotal: i.lineTotal.toNumber(),
      coverImage: i.listing.images[0] ? toImageDto(i.listing.images[0]) : null,
    })),
    fxRate: order.fxRate.toNumber(),
    deliveryNotes: order.deliveryNotes,
    buyerNote: order.buyerNote,
    cancelReason: order.cancelReason,
    buyer: toParty(order.buyer, showPhone, false),
    seller: toParty(order.seller, showPhone, true),
    sellerTown: item.listing.town,
    conversationId,
    review: order.review
      ? {
          rating: order.review.rating,
          comment: order.review.comment,
          createdAt: order.review.createdAt.toISOString(),
          hidden: order.review.hiddenAt !== null,
        }
      : null,
    canReview: viewerId === order.buyerId && order.status === 'COMPLETED' && !order.review,
    events: order.events.map((e) => ({
      type: e.type,
      note: e.note,
      actor:
        e.actorId === order.buyerId
          ? 'buyer'
          : e.actorId === order.sellerId
            ? 'seller'
            : e.actorId
              ? 'admin'
              : null,
      createdAt: e.createdAt.toISOString(),
    })),
    // Admins can view any order, but only the buyer and seller can act on it.
    actions:
      viewerId === order.buyerId || viewerId === order.sellerId
        ? availableOrderActions(order, summary.role)
        : [],
    acceptedAt: order.acceptedAt?.toISOString() ?? null,
    buyerPaidAt: order.buyerPaidAt?.toISOString() ?? null,
    receivedAt: order.receivedAt?.toISOString() ?? null,
    completedAt: order.completedAt?.toISOString() ?? null,
    cancelledAt: order.cancelledAt?.toISOString() ?? null,
  };
}
