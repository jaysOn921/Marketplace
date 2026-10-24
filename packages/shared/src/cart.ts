import { z } from 'zod';
import type { CountryCode, CurrencyCode } from './constants.js';
import type { ListingImageDto } from './listings.js';
import { DELIVERY_METHODS, type DeliveryMethod } from './orders.js';

/** Most of one item a cart line can hold. */
export const CART_MAX_QUANTITY = 99;
/** Most different items a cart can hold. */
export const CART_MAX_ITEMS = 50;

const quantity = z.coerce
  .number({ error: 'Choose how many.' })
  .int({ error: 'Use a whole number.' })
  .min(1, { error: 'At least 1.' })
  .max(CART_MAX_QUANTITY, { error: `At most ${CART_MAX_QUANTITY}.` });

export const addToCartSchema = z.object({
  listingId: z.coerce.number().int().positive(),
  quantity: quantity.default(1),
});
export type AddToCartInput = z.input<typeof addToCartSchema>;

export const updateCartItemSchema = z.object({ quantity });

/** Checkout: one order per seller listed here; other sellers' items stay in the cart. */
export const checkoutSchema = z.object({
  orders: z
    .array(
      z.object({
        sellerId: z.coerce.number().int().positive(),
        deliveryMethod: z.enum(DELIVERY_METHODS, {
          error: 'Choose how you want to get the items.',
        }),
        buyerNote: z
          .string()
          .trim()
          .max(500, { error: 'Use at most 500 characters.' })
          .optional()
          .transform((v) => (v ? v : null)),
      }),
    )
    .min(1, { error: 'Choose at least one seller to order from.' }),
});
export type CheckoutInput = z.input<typeof checkoutSchema>;

/** Why a cart line can't be ordered as it is. */
export type CartProblem = 'UNAVAILABLE' | 'NOT_IN_YOUR_COUNTRY' | 'NOT_ENOUGH_STOCK';

export interface CartLine {
  listingId: number;
  title: string;
  coverImage: ListingImageDto | null;
  unitPrice: number;
  quantity: number;
  /** How many the seller has left. */
  available: number;
  lineTotal: number;
  problem: CartProblem | null;
}

export interface CartGroup {
  seller: {
    id: number;
    name: string;
    shopName: string | null;
    shopSlug: string | null;
    countryCode: CountryCode;
    town: string | null;
  };
  /** The seller's currency; every line in a group uses it. */
  currency: CurrencyCode;
  items: CartLine[];
  /** Lines without a problem, in the seller's currency. */
  subtotal: number;
  /** The same, converted to the buyer's currency (null if no rate is set). */
  buyerSubtotal: number | null;
  /** Delivery options every orderable item in this group offers to this buyer. */
  deliveryMethods: DeliveryMethod[];
}

export interface CartResponse {
  groups: CartGroup[];
  buyerCurrency: CurrencyCode;
  /** All orderable lines, in the buyer's currency (null if a needed rate is missing). */
  total: number | null;
  /** Units in the cart (for the header badge). */
  count: number;
}

export interface CheckoutResponse {
  orderIds: number[];
}
