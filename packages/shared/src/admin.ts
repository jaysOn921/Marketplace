import { z } from 'zod';
import type { CountryCode, CurrencyCode } from './constants.js';
import type { ListingStatus } from './listings.js';
import type { TicketStatus } from './support.js';

const reason = z
  .string()
  .trim()
  .min(3, { error: 'Give a short reason (shown to the person).' })
  .max(500, { error: 'Use at most 500 characters.' });

export const adminReasonSchema = z.object({ reason });

export const rateUpdateSchema = z.object({
  /** How many shillings one kwacha buys. */
  rate: z.coerce
    .number({ error: 'Enter the rate.' })
    .positive({ error: 'Enter a rate above zero.' })
    .min(1, { error: 'That looks too low for TZS per ZMW.' })
    .max(10_000, { error: 'That looks too high for TZS per ZMW.' }),
  note: z.string().trim().max(255).optional(),
  /** Needed when the rate changes by more than 20%, in case of a typing mistake. */
  confirmLargeChange: z.boolean().optional(),
});
export type RateUpdateInput = z.input<typeof rateUpdateSchema>;
export const LARGE_RATE_CHANGE = 0.2;

export const categorySchema = z.object({
  name: z.string().trim().min(2, { error: 'Enter a name.' }).max(80),
  parentId: z.coerce.number().int().positive().nullable().optional(),
  sortOrder: z.coerce.number().int().min(0).max(999).optional(),
  isActive: z.boolean().optional(),
});
export type CategoryInput = z.input<typeof categorySchema>;

export const faqArticleSchema = z.object({
  title: z.string().trim().min(5, { error: 'Enter a title.' }).max(200),
  topic: z.string().trim().min(2).max(64),
  body: z.string().trim().min(20, { error: 'Write at least a short paragraph.' }).max(20_000),
  sortOrder: z.coerce.number().int().min(0).max(999).optional(),
  isPublished: z.boolean().optional(),
});
export type FaqArticleInput = z.input<typeof faqArticleSchema>;

export const ticketStaffReplySchema = z.object({
  body: z.string().trim().min(2, { error: 'Write a reply.' }).max(5000),
  close: z.boolean().optional(),
});

// ─── DTOs ────────────────────────────────────────────────────────────────────

export interface AdminStats {
  users: {
    total: number;
    byCountry: Record<CountryCode, number>;
    newThisWeek: number;
    suspended: number;
  };
  listings: Partial<Record<ListingStatus, number>>;
  orders: { total: number; thisWeek: number; byStatus: Record<string, number> };
  waiting: { reviewQueue: number; openReports: number; openTickets: number };
  rate: { rate: number; effectiveAt: string; daysOld: number } | null;
}

export interface AdminUserRow {
  id: number;
  name: string;
  email: string;
  countryCode: CountryCode;
  role: 'USER' | 'ADMIN';
  status: 'ACTIVE' | 'SUSPENDED' | 'DELETED';
  emailVerified: boolean;
  shopName: string | null;
  shopSlug: string | null;
  /** When the seller was verified, if they are. */
  verifiedAt: string | null;
  listings: number;
  orders: number;
  reportsAgainst: number;
  createdAt: string;
  lastLoginAt: string | null;
}

export interface AdminListingRow {
  id: number;
  title: string;
  status: ListingStatus;
  price: number;
  currency: CurrencyCode;
  countryCode: CountryCode;
  sellerId: number;
  sellerName: string;
  shopName: string | null;
  thumbUrl: string | null;
  updatedAt: string;
}

export interface AdminReviewRow {
  id: number;
  orderId: number;
  rating: number;
  comment: string | null;
  reviewerId: number;
  reviewerName: string;
  sellerId: number;
  /** Shop name, or the seller's name if they have no shop profile. */
  sellerName: string;
  shopSlug: string | null;
  listingTitle: string;
  createdAt: string;
  hiddenAt: string | null;
  hiddenReason: string | null;
}

export interface AdminTicketRow {
  id: number;
  subject: string;
  status: TicketStatus;
  name: string;
  email: string;
  isGuest: boolean;
  messages: number;
  updatedAt: string;
}

export interface AdminCategoryRow {
  id: number;
  name: string;
  slug: string;
  parentId: number | null;
  sortOrder: number;
  isActive: boolean;
  listings: number;
}

export interface AdminFaqRow {
  id: number;
  slug: string;
  title: string;
  topic: string;
  body: string;
  sortOrder: number;
  isPublished: boolean;
  updatedAt: string;
}

export interface AuditLogRow {
  id: number;
  action: string;
  actorId: number | null;
  actorName: string | null;
  targetType: string | null;
  targetId: number | null;
  before: unknown;
  after: unknown;
  ip: string | null;
  createdAt: string;
}

export interface Paged<T> {
  rows: T[];
  total: number;
  page: number;
  pageCount: number;
}
