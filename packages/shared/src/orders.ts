import { z } from 'zod';
import type { CountryCode, CurrencyCode } from './constants.js';
import type { ListingImageDto } from './listings.js';

export const ORDER_STATUSES = [
  'PLACED',
  'ACCEPTED',
  'READY',
  'COMPLETED',
  'DECLINED',
  'CANCELLED',
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];
export const DELIVERY_METHODS = ['PICKUP', 'LOCAL', 'CROSS_BORDER'] as const;
export type DeliveryMethod = (typeof DELIVERY_METHODS)[number];
export type PaymentStatus = 'UNPAID' | 'PAID_OFFLINE';

/** Order steps and who may take them. */
export const ORDER_ACTIONS = [
  'accept',
  'decline',
  'ready',
  'received',
  'report-paid',
  'complete',
  'cancel',
  'mark-paid',
] as const;
export type OrderAction = (typeof ORDER_ACTIONS)[number];

/** Which statuses each action can start from, and whether the buyer and/or seller may take it. */
export const ORDER_TRANSITIONS: Record<
  OrderAction,
  { from: OrderStatus[]; to?: OrderStatus; buyer: boolean; seller: boolean; needsReason?: boolean }
> = {
  accept: { from: ['PLACED'], to: 'ACCEPTED', buyer: false, seller: true },
  decline: { from: ['PLACED'], to: 'DECLINED', buyer: false, seller: true, needsReason: true },
  ready: { from: ['ACCEPTED'], to: 'READY', buyer: false, seller: true },
  // The buyer confirms receipt (e.g. after collecting); the seller then completes the order.
  received: { from: ['ACCEPTED', 'READY'], buyer: true, seller: false },
  // The buyer says they paid; the seller confirms with mark-paid. Status doesn't change.
  'report-paid': { from: ['ACCEPTED', 'READY', 'COMPLETED'], buyer: true, seller: false },
  complete: { from: ['ACCEPTED', 'READY'], to: 'COMPLETED', buyer: false, seller: true },
  // Not after the buyer has confirmed receipt.
  cancel: { from: ['PLACED', 'ACCEPTED'], to: 'CANCELLED', buyer: true, seller: true },
  // Payment happens offline; the seller records it. Status doesn't change.
  'mark-paid': { from: ['ACCEPTED', 'READY', 'COMPLETED'], buyer: false, seller: true },
};

/** Actions available to one side of an order right now. */
export function availableOrderActions(
  order: {
    status: OrderStatus;
    paymentStatus: PaymentStatus;
    buyerPaidAt?: unknown;
    receivedAt?: unknown;
  },
  role: 'buyer' | 'seller',
): OrderAction[] {
  const received = Boolean(order.receivedAt);
  return ORDER_ACTIONS.filter((a) => {
    const t = ORDER_TRANSITIONS[a];
    if (!t[role] || !t.from.includes(order.status)) return false;
    if (a === 'mark-paid') return order.paymentStatus === 'UNPAID';
    if (a === 'report-paid') return order.paymentStatus === 'UNPAID' && !order.buyerPaidAt;
    if (a === 'received') return !received;
    if (a === 'cancel') return !received;
    return true;
  });
}

export const placeOrderSchema = z.object({
  listingId: z.coerce.number().int().positive(),
  quantity: z.coerce
    .number({ error: 'Choose how many.' })
    .int({ error: 'Use a whole number.' })
    .min(1, { error: 'At least 1.' })
    .max(999),
  deliveryMethod: z.enum(DELIVERY_METHODS, { error: 'Choose how you want to get the item.' }),
  buyerNote: z
    .string()
    .trim()
    .max(500, { error: 'Use at most 500 characters.' })
    .optional()
    .transform((v) => (v ? v : null)),
});
export type PlaceOrderInput = z.input<typeof placeOrderSchema>;

export const orderActionSchema = z.object({
  reason: z
    .string()
    .trim()
    .max(500, { error: 'Use at most 500 characters.' })
    .optional()
    .transform((v) => (v ? v : null)),
});

// ─── DTOs ────────────────────────────────────────────────────────────────────

export interface OrderParty {
  id: number;
  name: string;
  countryCode: CountryCode;
  /** Shown only once the seller has accepted the order. */
  phone: string | null;
  shopName?: string;
  shopSlug?: string;
}

export interface OrderSummary {
  id: number;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  /** The viewer's side of the order. */
  role: 'buyer' | 'seller';
  title: string;
  quantity: number;
  currency: CurrencyCode;
  total: number;
  buyerCurrency: CurrencyCode;
  buyerTotal: number;
  deliveryMethod: DeliveryMethod;
  coverImage: ListingImageDto | null;
  otherParty: string;
  createdAt: string;
  updatedAt: string;
}

export interface OrderEventDto {
  type: string;
  note: string | null;
  actor: 'buyer' | 'seller' | 'admin' | null;
  createdAt: string;
}

export interface OrderDetail extends OrderSummary {
  listingId: number;
  unitPrice: number;
  /** Rate used at order time: 1 unit of `currency` = fxRate units of `buyerCurrency`. */
  fxRate: number;
  deliveryNotes: string | null;
  buyerNote: string | null;
  cancelReason: string | null;
  buyer: OrderParty;
  seller: OrderParty;
  sellerTown: string;
  events: OrderEventDto[];
  /** The buyer's review of this order, once given. */
  /** `hidden` is true when the TZed team has taken the review off the shop page. */
  review: { rating: number; comment: string | null; createdAt: string; hidden: boolean } | null;
  /** True for the buyer of a completed order that hasn't been reviewed yet. */
  canReview: boolean;
  /** The buyer–seller conversation about this listing, if one exists. */
  conversationId: number | null;
  actions: OrderAction[];
  acceptedAt: string | null;
  buyerPaidAt: string | null;
  receivedAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
}

export interface OrderResponse {
  order: OrderDetail;
}

export interface OrdersResponse {
  orders: OrderSummary[];
  /** Orders waiting for the viewer as seller (to accept or decline). */
  needsAction: number;
}
