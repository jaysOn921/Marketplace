import { z } from 'zod';
import type { CountryCode, CurrencyCode } from './constants.js';
import type { SellerRating } from './reviews.js';

export const LISTING_CONDITIONS = ['NEW', 'LIKE_NEW', 'GOOD', 'FAIR', 'FOR_PARTS'] as const;
export type ListingCondition = (typeof LISTING_CONDITIONS)[number];

export const LISTING_STATUSES = [
  'DRAFT',
  'PENDING_REVIEW',
  'ACTIVE',
  'REJECTED',
  'SOLD',
  'REMOVED',
] as const;
export type ListingStatus = (typeof LISTING_STATUSES)[number];

export const MAX_LISTING_IMAGES = 8;
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const MAX_PRICE = 10_000_000_000;

const checkbox = z
  .union([z.boolean(), z.literal('true'), z.literal('false')])
  .transform((v) => v === true || v === 'true');

/** Delivery time ranges a seller can choose from, in days ("4-7" means 4 to 7 days). */
export const DELIVERY_DAY_RANGES = ['1-2', '2-4', '3-5', '4-7', '5-10', '7-14', '14-21'] as const;
export type DeliveryDayRange = (typeof DELIVERY_DAY_RANGES)[number];

/** A range as [min, max] days, or null when the seller didn't give one. */
export type DayRange = [number, number] | null;

export const parseDayRange = (r: string | null | undefined): DayRange => {
  if (!r) return null;
  const [min, max] = r.split('-').map(Number);
  return min !== undefined && max !== undefined ? [min, max] : null;
};
export const formatDayRange = (min: number | null, max: number | null) =>
  min !== null && max !== null ? `${min}-${max}` : null;

/** Optional range: "" or null clears it. */
const dayRange = z
  .union([z.enum(DELIVERY_DAY_RANGES), z.literal(''), z.null()], {
    error: 'Choose one of the listed times.',
  })
  .optional()
  .transform((v) => (v ? v : null));

const listingFields = {
  title: z
    .string()
    .trim()
    .min(5, { error: 'Use at least 5 characters.' })
    .max(120, { error: 'Use at most 120 characters.' }),
  description: z
    .string()
    .trim()
    .min(20, { error: 'Describe the item in at least 20 characters.' })
    .max(5000, { error: 'Use at most 5000 characters.' }),
  categoryId: z.coerce
    .number({ error: 'Choose a category.' })
    .int()
    .positive({ error: 'Choose a category.' }),
  condition: z.enum(LISTING_CONDITIONS, { error: 'Choose the condition.' }),
  price: z.coerce
    .number({ error: 'Enter a price.' })
    .positive({ error: 'Enter a price above zero.' })
    .max(MAX_PRICE, { error: 'That price is too high.' }),
  quantity: z.coerce
    .number({ error: 'Enter how many you have.' })
    .int({ error: 'Use a whole number.' })
    .min(1, { error: 'At least 1.' })
    .max(999, { error: 'At most 999.' }),
  regionId: z.coerce.number().int().positive({ error: 'Choose a region or province.' }),
  town: z
    .string()
    .trim()
    .min(2, { error: 'Enter the town or city.' })
    .max(80, { error: 'Use at most 80 characters.' }),
  deliveryPickup: checkbox,
  deliveryLocal: checkbox,
  /** Also available to buyers in the other country, sent across the border. */
  crossBorder: checkbox,
  deliveryNotes: z
    .string()
    .trim()
    .max(500, { error: 'Use at most 500 characters.' })
    .optional()
    .transform((v) => (v ? v : null)),
  /** Usual delivery time for local delivery and for sending across the border. */
  localDays: dayRange,
  crossBorderDays: dayRange,
};

export const needsDelivery = (d: {
  deliveryPickup?: boolean;
  deliveryLocal?: boolean;
  crossBorder?: boolean;
}) => Boolean(d.deliveryPickup || d.deliveryLocal || d.crossBorder);
export const DELIVERY_REQUIRED_MESSAGE = 'Choose at least one way to get the item to the buyer.';
const deliveryMessage = {
  path: ['deliveryPickup'],
  error: DELIVERY_REQUIRED_MESSAGE,
};

export const listingCreateSchema = z.object(listingFields).refine(needsDelivery, deliveryMessage);
export type ListingCreateInput = z.input<typeof listingCreateSchema>;

/**
 * Partial update: only the fields sent are changed. The "at least one delivery option"
 * rule is checked by the API after merging with the saved listing.
 */
export const listingUpdateSchema = z.object(listingFields).partial();
export type ListingUpdateInput = z.input<typeof listingUpdateSchema>;

export const rejectListingSchema = z.object({
  reason: z
    .string()
    .trim()
    .min(5, { error: 'Tell the seller what to fix (at least 5 characters).' })
    .max(500, { error: 'Use at most 500 characters.' }),
});

export const imageOrderSchema = z.object({
  imageIds: z.array(z.number().int().positive()).max(MAX_LISTING_IMAGES),
});

// ─── DTOs ────────────────────────────────────────────────────────────────────

export interface ListingImageDto {
  id: number;
  thumbUrl: string;
  url: string;
  width: number;
  height: number;
}

export interface ListingSummary {
  id: number;
  title: string;
  price: number;
  currency: CurrencyCode;
  condition: ListingCondition;
  status: ListingStatus;
  quantity: number;
  countryCode: CountryCode;
  regionName: string;
  town: string;
  crossBorder: boolean;
  coverImage: ListingImageDto | null;
  createdAt: string;
  publishedAt: string | null;
  /** The seller's rating, where the list includes it (search, shop, home). */
  sellerRating?: SellerRating | null;
}

export interface CategoryRef {
  id: number;
  name: string;
  slug: string;
  parent: { id: number; name: string; slug: string } | null;
}

export interface ListingDetail extends ListingSummary {
  description: string;
  categoryId: number;
  category: CategoryRef;
  regionId: number;
  images: ListingImageDto[];
  deliveryPickup: boolean;
  deliveryLocal: boolean;
  deliveryNotes: string | null;
  /** The seller's usual delivery times, e.g. "4-7"; null when not given. */
  localDays: DeliveryDayRange | null;
  crossBorderDays: DeliveryDayRange | null;
  shipTo: CountryCode[];
  seller: {
    shopName: string;
    slug: string;
    town: string | null;
    regionName: string | null;
    countryCode: CountryCode;
    memberSince: string;
    rating: SellerRating | null;
  };
  /** Only for the owner and admins. */
  rejectionReason: string | null;
  submittedAt: string | null;
  updatedAt: string;
  isOwner: boolean;
}

export interface ListingReviewEventDto {
  decision: 'SUBMITTED' | 'APPROVED' | 'REJECTED';
  reason: string | null;
  actorName: string | null;
  createdAt: string;
}

export interface ReviewQueueItem extends ListingDetail {
  sellerAccount: { id: number; name: string; email: string; createdAt: string };
  /** True if this listing was live before (an edit is waiting for re-approval). */
  wasPublished: boolean;
  history: ListingReviewEventDto[];
}

export interface CategoryNode {
  id: number;
  name: string;
  slug: string;
  children: CategoryNode[];
}

export interface ListingResponse {
  listing: ListingDetail;
  /** Set when an edit sent a live listing back for review. */
  sentForReview?: boolean;
}

export interface MyListingsResponse {
  listings: ListingSummary[];
  counts: Partial<Record<ListingStatus, number>>;
}
