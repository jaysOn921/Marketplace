import { z } from 'zod';
import type { CountryCode } from './constants.js';

export const reviewSchema = z.object({
  rating: z.coerce
    .number({ error: 'Choose a rating from 1 to 5 stars.' })
    .int()
    .min(1, { error: 'Choose a rating from 1 to 5 stars.' })
    .max(5, { error: 'Choose a rating from 1 to 5 stars.' }),
  comment: z
    .string()
    .trim()
    .max(1000, { error: 'Use at most 1000 characters.' })
    .optional()
    .transform((v) => (v ? v : null)),
});
export type ReviewInput = z.input<typeof reviewSchema>;

/** A seller's average rating (1 decimal) and number of reviews. */
export interface SellerRating {
  average: number;
  count: number;
}

export interface ReviewDto {
  id: number;
  rating: number;
  comment: string | null;
  /** e.g. "Natasha P." */
  reviewerName: string;
  reviewerCountry: CountryCode;
  listingTitle: string;
  createdAt: string;
}

export interface ReviewsResponse {
  reviews: ReviewDto[];
  rating: SellerRating | null;
  /** How many reviews have each star count, 5 → 1. */
  breakdown: Record<1 | 2 | 3 | 4 | 5, number>;
  page: number;
  pageCount: number;
}

/** "Natasha Phiri" → "Natasha P." */
export function shortName(name: string): string {
  const [first, ...rest] = name.trim().split(/\s+/);
  const last = rest.at(-1);
  return last ? `${first} ${last[0]!.toUpperCase()}.` : (first ?? '');
}
