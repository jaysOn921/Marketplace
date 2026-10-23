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
  complete: { from: ['READY'], to: 'COMPLETED', buyer: true, seller: true },
  cancel: { from: ['PLACED', 'ACCEPTED'], to: 'CANCELLED', buyer: true, seller: true },
  // Payment happens offline; the seller records it. Status doesn't change.
  'mark-paid': { from: ['ACCEPTED', 'READY', 'COMPLETED'], buyer: false, seller: true },
};

/** Actions available to one side of an order right now. */
export function availableOrderActions(
  order: { status: OrderStatus; paymentStatus: PaymentStatus },
  role: 'buyer' | 'seller',
): OrderAction[] {
  return ORDER_ACTIONS.filter((a) => {
    const t = ORDER_TRANSITIONS[a];
    if (!t[role] || !t.from.includes(order.status)) return false;
    return a !== 'mark-paid' || order.paymentStatus === 'UNPAID';
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
  actions: OrderAction[];
  acceptedAt: string | null;
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
