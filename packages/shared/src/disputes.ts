import { z } from 'zod';

export const DISPUTE_REASONS = [
  'NOT_RECEIVED',
  'NOT_AS_DESCRIBED',
  'DAMAGED',
  'PAYMENT',
  'NO_RESPONSE',
  'OTHER',
] as const;
export type DisputeReason = (typeof DISPUTE_REASONS)[number];
export type DisputeStatus = 'OPEN' | 'RESOLVED';

const body = z
  .string()
  .trim()
  .min(10, { error: 'Please describe what happened (at least 10 characters).' })
  .max(2000, { error: 'Use at most 2000 characters.' });

export const openDisputeSchema = z.object({
  reason: z.enum(DISPUTE_REASONS, { error: 'Choose what the problem is.' }),
  details: body,
});
export type OpenDisputeInput = z.input<typeof openDisputeSchema>;

export const disputeMessageSchema = z.object({
  body: z
    .string()
    .trim()
    .min(1, { error: 'Write a message.' })
    .max(2000, { error: 'Use at most 2000 characters.' }),
});

export const resolveDisputeSchema = z.object({
  resolution: z
    .string()
    .trim()
    .min(10, { error: 'Explain the outcome to both sides (at least 10 characters).' })
    .max(1000, { error: 'Use at most 1000 characters.' }),
});

export interface DisputeMessageDto {
  id: number;
  /** Who wrote it, from the viewer's point of view. */
  author: 'buyer' | 'seller' | 'tzed';
  authorName: string;
  body: string;
  createdAt: string;
}

export interface DisputeDto {
  id: number;
  orderId: number;
  status: DisputeStatus;
  reason: DisputeReason;
  openedBy: 'buyer' | 'seller';
  resolution: string | null;
  resolvedAt: string | null;
  createdAt: string;
  messages: DisputeMessageDto[];
}

export interface AdminDisputeRow {
  id: number;
  orderId: number;
  status: DisputeStatus;
  reason: DisputeReason;
  openedBy: 'buyer' | 'seller';
  buyerName: string;
  sellerName: string;
  orderTitle: string;
  messages: number;
  createdAt: string;
  updatedAt: string;
}
