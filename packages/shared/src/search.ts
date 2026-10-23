import { z } from 'zod';
import { COUNTRY_CODES, CURRENCY_CODES } from './constants.js';
import { LISTING_CONDITIONS, type ListingSummary } from './listings.js';
import type { SellerRating } from './reviews.js';

export const SEARCH_SORTS = ['relevance', 'newest', 'price_asc', 'price_desc'] as const;
export type SearchSort = (typeof SEARCH_SORTS)[number];
export const SEARCH_PAGE_SIZE = 24;

const optionalNumber = z
  .union([z.literal(''), z.coerce.number().nonnegative()])
  .optional()
  .transform((v) => (v === '' || v === undefined ? undefined : v));

/** Query string of GET /search. Unknown or invalid values are dropped rather than rejected. */
export const searchQuerySchema = z.object({
  q: z.string().trim().max(100).optional().catch(undefined),
  category: z.string().trim().max(100).optional().catch(undefined),
  /** Where the seller is. */
  country: z.enum(COUNTRY_CODES).optional().catch(undefined),
  /** Listings a buyer in this country can get (same country, or cross-border). */
  availableIn: z.enum(COUNTRY_CODES).optional().catch(undefined),
  condition: z
    .string()
    .optional()
    .transform((v) =>
      v ? v.split(',').filter((c) => (LISTING_CONDITIONS as readonly string[]).includes(c)) : [],
    )
    .catch([]),
  minPrice: optionalNumber.catch(undefined),
  maxPrice: optionalNumber.catch(undefined),
  /** Currency the price range is given in. */
  currency: z.enum(CURRENCY_CODES).optional().catch(undefined),
  seller: z.string().trim().max(100).optional().catch(undefined),
  sort: z.enum(SEARCH_SORTS).optional().catch(undefined),
  page: z.coerce.number().int().min(1).max(500).default(1).catch(1),
  pageSize: z.coerce
    .number()
    .int()
    .min(1)
    .max(48)
    .default(SEARCH_PAGE_SIZE)
    .catch(SEARCH_PAGE_SIZE),
});
export type SearchQuery = z.output<typeof searchQuerySchema>;

export interface SearchFacet {
  key: string;
  label: string;
  count: number;
}

export interface SearchResponse {
  results: ListingSummary[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
  sort: SearchSort;
  /**
   * 'all' when results contain every search word; 'any' when nothing matched them all and
   * results contain at least one of the words.
   */
  matchMode: 'all' | 'any' | null;
  /** The category being browsed, if any. */
  category: {
    slug: string;
    name: string;
    parent: { slug: string; name: string } | null;
    children: { slug: string; name: string }[];
  } | null;
  facets: { categories: SearchFacet[]; countries: SearchFacet[] };
}

export interface SuggestResponse {
  listings: { id: number; title: string }[];
  categories: { slug: string; name: string }[];
}

export interface ShopResponse {
  shop: {
    shopName: string;
    slug: string;
    bio: string | null;
    town: string | null;
    regionName: string | null;
    countryCode: 'TZ' | 'ZM';
    memberSince: string;
    activeListings: number;
    rating: SellerRating | null;
  };
}
