import { z } from 'zod';

// ─── Help centre ─────────────────────────────────────────────────────────────

export const HELP_TOPICS = ['getting-started', 'buying', 'selling', 'payments', 'safety'] as const;
export type HelpTopic = (typeof HELP_TOPICS)[number];

export interface HelpArticleSummary {
  slug: string;
  title: string;
  topic: string;
  /** First ~160 characters of the article. */
  excerpt: string;
}

export interface HelpArticlesResponse {
  articles: HelpArticleSummary[];
  topics: { topic: string; count: number }[];
  matchMode: 'all' | 'any' | null;
}

export interface HelpArticleResponse {
  article: HelpArticleSummary & { body: string; updatedAt: string };
  related: HelpArticleSummary[];
}

// ─── Support tickets ─────────────────────────────────────────────────────────

const message = z
  .string()
  .trim()
  .min(10, { error: 'Tell us a bit more (at least 10 characters).' })
  .max(5000, { error: 'Use at most 5000 characters.' });

export const ticketSchema = z.object({
  /** Required for guests; signed-in users' account details are used instead. */
  name: z.string().trim().max(100).optional(),
  email: z.string().trim().toLowerCase().max(191).optional(),
  subject: z
    .string()
    .trim()
    .min(4, { error: 'Add a short subject.' })
    .max(200, { error: 'Use at most 200 characters.' }),
  body: message,
});
export type TicketInput = z.input<typeof ticketSchema>;

export const guestContactSchema = z.object({
  name: z.string().trim().min(2, { error: 'Enter your name.' }).max(100),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .pipe(z.email({ error: 'Enter a valid email address.' })),
});

export const ticketReplySchema = z.object({ body: message });

export type TicketStatus = 'OPEN' | 'ANSWERED' | 'CLOSED';

export interface TicketSummary {
  id: number;
  subject: string;
  status: TicketStatus;
  updatedAt: string;
  createdAt: string;
}

export interface TicketDetail extends TicketSummary {
  name: string;
  email: string;
  messages: { id: number; body: string; fromStaff: boolean; createdAt: string }[];
}

// ─── Reports ─────────────────────────────────────────────────────────────────

export const REPORT_TARGETS = ['LISTING', 'USER', 'MESSAGE'] as const;
export type ReportTarget = (typeof REPORT_TARGETS)[number];
export const REPORT_REASONS = [
  'SCAM',
  'PROHIBITED_ITEM',
  'WRONG_CATEGORY',
  'OFFENSIVE',
  'OTHER',
] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];

export const reportSchema = z
  .object({
    targetType: z.enum(REPORT_TARGETS),
    targetId: z.coerce.number().int().positive(),
    reason: z.enum(REPORT_REASONS, { error: 'Choose a reason.' }),
    details: z
      .string()
      .trim()
      .max(1000, { error: 'Use at most 1000 characters.' })
      .optional()
      .transform((v) => (v ? v : null)),
  })
  .refine((r) => r.reason !== 'OTHER' || Boolean(r.details), {
    path: ['details'],
    error: 'Please tell us what is wrong.',
  });
export type ReportInput = z.input<typeof reportSchema>;

export const REPORT_ACTIONS = ['none', 'remove_listing', 'remove_message', 'suspend_user'] as const;
export type ReportAction = (typeof REPORT_ACTIONS)[number];

export const resolveReportSchema = z.object({
  targetType: z.enum(REPORT_TARGETS),
  targetId: z.coerce.number().int().positive(),
  decision: z.enum(['dismiss', 'action']),
  actions: z.array(z.enum(REPORT_ACTIONS)).default([]),
  note: z
    .string()
    .trim()
    .min(3, { error: 'Add a short note about your decision.' })
    .max(1000, { error: 'Use at most 1000 characters.' }),
});
export type ResolveReportInput = z.input<typeof resolveReportSchema>;

/** Reports about one thing, grouped for the admin queue. */
export interface ReportGroup {
  targetType: ReportTarget;
  targetId: number;
  /** What was reported, for context (title, user name, message text…). */
  target: {
    label: string;
    detail: string | null;
    link: string | null;
    /** For messages and listings: the user responsible. */
    ownerId: number | null;
    ownerName: string | null;
    status: string | null;
  };
  count: number;
  reasons: Partial<Record<ReportReason, number>>;
  firstReportedAt: string;
  lastReportedAt: string;
  reports: {
    id: number;
    reason: ReportReason;
    details: string | null;
    reporterName: string;
    createdAt: string;
  }[];
  /** Earlier resolved reports about the same thing. */
  previouslyResolved: number;
}
