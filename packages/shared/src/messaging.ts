import { z } from 'zod';
import type { CurrencyCode } from './constants.js';
import type { ListingImageDto } from './listings.js';

export const MAX_MESSAGE_LENGTH = 2000;

const body = z
  .string()
  .trim()
  .min(1, { error: 'Write a message.' })
  .max(MAX_MESSAGE_LENGTH, { error: `Use at most ${MAX_MESSAGE_LENGTH} characters.` });

/** Start (or continue) a conversation about a listing. Sellers pass the buyer they're writing to. */
export const startConversationSchema = z.object({
  listingId: z.coerce.number().int().positive(),
  buyerId: z.coerce.number().int().positive().optional(),
  body,
});
export type StartConversationInput = z.input<typeof startConversationSchema>;

export const sendMessageSchema = z.object({ body });

export interface MessageDto {
  id: number;
  body: string;
  mine: boolean;
  createdAt: string;
}

export interface ConversationSummary {
  id: number;
  listing: {
    id: number;
    title: string;
    price: number;
    currency: CurrencyCode;
    coverImage: ListingImageDto | null;
  };
  role: 'buyer' | 'seller';
  otherParty: string;
  lastMessage: { body: string; mine: boolean; createdAt: string } | null;
  unread: number;
  lastMessageAt: string;
}

export interface ConversationsResponse {
  conversations: ConversationSummary[];
  unread: number;
}

export interface ConversationResponse {
  conversation: ConversationSummary & {
    /** False when the other person's account is suspended or deleted. */
    canReply: boolean;
    /** Contact details are shared through orders, so link to them. */
    orderId: number | null;
  };
  messages: MessageDto[];
  /** True if older messages exist (load with ?before=<oldest id>). */
  hasMore: boolean;
}

export interface NotificationDto {
  id: number;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  read: boolean;
  createdAt: string;
}

export interface NotificationsResponse {
  notifications: NotificationDto[];
  unread: number;
}

/** Everything the header badges need, in one request. */
export interface CountsResponse {
  notifications: number;
  messages: number;
  /** Orders waiting for the user as seller. */
  ordersToAct: number;
  /** Listings waiting for review (admins only, otherwise 0). */
  reviewQueue: number;
}
