import type { Prisma } from '@prisma/client';
import type { Request } from 'express';
import {
  LARGE_RATE_CHANGE,
  adminReasonSchema,
  categorySchema,
  faqArticleSchema,
  rateUpdateSchema,
  ticketStaffReplySchema,
  type AdminCategoryRow,
  type AdminFaqRow,
  type AdminListingRow,
  type AdminReviewRow,
  type AdminStats,
  type AdminTicketRow,
  type AdminUserRow,
  type AuditLogRow,
  type CountryCode,
  type CurrencyCode,
  type Paged,
} from '@tzed/shared';
import { prisma } from '../../db.js';
import { renderEmail } from '../../lib/email-layout.js';
import { AppError } from '../../lib/errors.js';
import { translate, type Locale } from '../../lib/i18n.js';
import { sendMailInBackground } from '../../lib/mailer.js';
import { slugify } from '../../lib/slug.js';
import { hashToken, randomToken } from '../../lib/tokens.js';
import type { AuthUser } from '../../middleware/auth.js';
import { recordAudit } from '../audit/audit.service.js';
import { destroyUserSessions } from '../auth/session-store.js';
import { toImageDto } from '../listings/listing-dto.js';
import { notify } from '../notifications/notifications.service.js';
import { openReportCount } from '../reports/reports.service.js';

const PAGE = 25;
const paged = <T>(rows: T[], total: number, page: number): Paged<T> => ({
  rows,
  total,
  page,
  pageCount: Math.max(1, Math.ceil(total / PAGE)),
});
const pageOf = (v: unknown) => Math.max(1, Math.min(Number(v) || 1, 1000));
const text = (v: unknown) =>
  typeof v === 'string' && v.trim() ? v.trim().slice(0, 100) : undefined;

// ─── Dashboard ───────────────────────────────────────────────────────────────

export async function stats(): Promise<AdminStats> {
  const weekAgo = new Date(Date.now() - 7 * 86_400_000);
  const [
    users,
    byCountry,
    newThisWeek,
    suspended,
    listings,
    orders,
    ordersWeek,
    orderStatus,
    reviewQueue,
    openReports,
    openTickets,
    rate,
  ] = await Promise.all([
    prisma.user.count({ where: { status: { not: 'DELETED' } } }),
    prisma.user.groupBy({ by: ['countryId'], where: { status: { not: 'DELETED' } }, _count: true }),
    prisma.user.count({ where: { createdAt: { gte: weekAgo } } }),
    prisma.user.count({ where: { status: 'SUSPENDED' } }),
    prisma.listing.groupBy({ by: ['status'], _count: true }),
    prisma.order.count(),
    prisma.order.count({ where: { createdAt: { gte: weekAgo } } }),
    prisma.order.groupBy({ by: ['status'], _count: true }),
    prisma.listing.count({ where: { status: 'PENDING_REVIEW' } }),
    openReportCount(),
    prisma.supportTicket.count({ where: { status: 'OPEN' } }),
    prisma.exchangeRate.findFirst({
      where: { baseCurrency: 'ZMW', quoteCurrency: 'TZS' },
      orderBy: [{ effectiveAt: 'desc' }, { id: 'desc' }],
    }),
  ]);
  const countries = await prisma.country.findMany();
  const code = (id: number) => countries.find((c) => c.id === id)?.code as CountryCode;
  return {
    users: {
      total: users,
      byCountry: Object.fromEntries(byCountry.map((g) => [code(g.countryId), g._count])) as Record<
        CountryCode,
        number
      >,
      newThisWeek,
      suspended,
    },
    listings: Object.fromEntries(listings.map((g) => [g.status, g._count])),
    orders: {
      total: orders,
      thisWeek: ordersWeek,
      byStatus: Object.fromEntries(orderStatus.map((g) => [g.status, g._count])),
    },
    waiting: { reviewQueue, openReports, openTickets },
    rate: rate
      ? {
          rate: rate.rate.toNumber(),
          effectiveAt: rate.effectiveAt.toISOString(),
          daysOld: Math.floor((Date.now() - rate.effectiveAt.getTime()) / 86_400_000),
        }
      : null,
  };
}

// ─── Users ───────────────────────────────────────────────────────────────────

export async function listUsers(query: Record<string, unknown>): Promise<Paged<AdminUserRow>> {
  const page = pageOf(query.page);
  const q = text(query.q);
  const where: Prisma.UserWhereInput = {
    ...(q
      ? {
          OR: [
            { name: { contains: q } },
            { email: { contains: q } },
            { sellerProfile: { shopName: { contains: q } } },
          ],
        }
      : {}),
    ...(['ACTIVE', 'SUSPENDED', 'DELETED'].includes(String(query.status))
      ? { status: query.status as 'ACTIVE' }
      : {}),
    ...(query.role === 'ADMIN' ? { role: 'ADMIN' } : {}),
  };
  const [rows, total] = await Promise.all([
    prisma.user.findMany({
      where,
      include: {
        country: true,
        sellerProfile: true,
        _count: { select: { listings: true, ordersAsBuyer: true, ordersAsSeller: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * PAGE,
      take: PAGE,
    }),
    prisma.user.count({ where }),
  ]);
  const reportCounts = rows.length
    ? await prisma.report.groupBy({
        by: ['targetId'],
        where: { targetType: 'USER', targetId: { in: rows.map((r) => r.id) } },
        _count: true,
      })
    : [];
  const reports = new Map(reportCounts.map((r) => [r.targetId, r._count]));
  return paged(
    rows.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      countryCode: u.country.code as CountryCode,
      role: u.role,
      status: u.status,
      emailVerified: u.emailVerifiedAt !== null,
      shopName: u.sellerProfile?.shopName ?? null,
      shopSlug: u.sellerProfile?.slug ?? null,
      verifiedAt: u.sellerProfile?.verifiedAt?.toISOString() ?? null,
      listings: u._count.listings,
      orders: u._count.ordersAsBuyer + u._count.ordersAsSeller,
      reportsAgainst: reports.get(u.id) ?? 0,
      createdAt: u.createdAt.toISOString(),
      lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
    })),
    total,
    page,
  );
}

export async function setUserStatus(
  admin: AuthUser,
  id: number,
  suspend: boolean,
  input: unknown,
  req: Request,
) {
  const { reason } = adminReasonSchema.parse(input);
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user || user.status === 'DELETED') throw AppError.notFound('User not found.');
  if (user.id === admin.id) throw AppError.badRequest("You can't change your own account here.");
  if (user.role === 'ADMIN') throw AppError.badRequest("Admins can't be suspended.");
  const to = suspend ? 'SUSPENDED' : 'ACTIVE';
  if (user.status === to)
    throw AppError.conflict(
      suspend ? 'This account is already suspended.' : 'This account is already active.',
    );

  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id }, data: { status: to } });
    await recordAudit(
      {
        action: suspend ? 'user.suspend' : 'user.reinstate',
        targetType: 'user',
        targetId: id,
        before: { status: user.status },
        after: { status: to, reason },
        req,
      },
      tx,
    );
  });
  if (suspend) await destroyUserSessions(id);

  // Suspended users can't sign in, so tell them by email directly.
  sendMailInBackground({
    to: user.email,
    subject: translate(
      suspend ? 'Your TZed account has been suspended' : 'Your TZed account is active again',
      user.locale as Locale,
    ),
    ...renderEmail({
      locale: user.locale as Locale,
      name: user.name,
      paragraphs: [
        suspend
          ? 'Your account has been suspended by the TZed team.'
          : 'Your account has been reinstated. You can sign in again.',
        `Reason: ${reason}`,
      ],
      action: suspend
        ? { label: 'Contact support', path: '/help/contact' }
        : { label: 'Sign in', path: '/login' },
    }),
  });
}

/** Gives or takes away a seller's "Verified seller" badge, with a note for the record. */
export async function setSellerVerified(
  admin: AuthUser,
  userId: number,
  verify: boolean,
  input: unknown,
  req: Request,
) {
  const { reason } = adminReasonSchema.parse(input);
  const profile = await prisma.sellerProfile.findUnique({ where: { userId } });
  if (!profile) throw AppError.notFound('This user has no seller profile.');
  if (verify && profile.verifiedAt) throw AppError.conflict('This seller is already verified.');
  if (!verify && !profile.verifiedAt) throw AppError.conflict('This seller is not verified.');

  await prisma.$transaction(async (tx) => {
    await tx.sellerProfile.update({
      where: { userId },
      data: verify
        ? { verifiedAt: new Date(), verifiedNote: reason }
        : { verifiedAt: null, verifiedNote: null },
    });
    await recordAudit(
      {
        action: verify ? 'seller.verify' : 'seller.unverify',
        targetType: 'user',
        targetId: userId,
        before: { verified: Boolean(profile.verifiedAt) },
        after: { verified: verify, note: reason },
        req,
      },
      tx,
    );
  });
  await notify(userId, {
    type: verify ? 'seller.verified' : 'seller.unverified',
    title: verify ? 'Your shop is now a verified seller' : 'Your verified seller badge was removed',
    body: verify
      ? `The TZed team has checked ${profile.shopName}. Buyers now see a “Verified seller” badge on your shop and listings.`
      : `The “Verified seller” badge was removed from ${profile.shopName}. Reason: ${reason}`,
    link: verify ? `/shop/${profile.slug}` : '/help/contact',
    email: true,
  });
}

// ─── Listings ────────────────────────────────────────────────────────────────

export async function listListings(
  query: Record<string, unknown>,
): Promise<Paged<AdminListingRow>> {
  const page = pageOf(query.page);
  const q = text(query.q);
  const where: Prisma.ListingWhereInput = {
    ...(q
      ? {
          OR: [
            { title: { contains: q } },
            ...(Number(q) ? [{ id: Number(q) }] : []),
            { seller: { email: { contains: q } } },
          ],
        }
      : {}),
    ...(['DRAFT', 'PENDING_REVIEW', 'ACTIVE', 'REJECTED', 'SOLD', 'REMOVED'].includes(
      String(query.status),
    )
      ? { status: query.status as 'ACTIVE' }
      : {}),
    ...(Number(query.sellerId) ? { sellerId: Number(query.sellerId) } : {}),
  };
  const [rows, total] = await Promise.all([
    prisma.listing.findMany({
      where,
      include: {
        country: true,
        seller: { include: { sellerProfile: true } },
        images: { orderBy: { sortOrder: 'asc' }, take: 1 },
      },
      orderBy: { updatedAt: 'desc' },
      skip: (page - 1) * PAGE,
      take: PAGE,
    }),
    prisma.listing.count({ where }),
  ]);
  return paged(
    rows.map((l) => ({
      id: l.id,
      title: l.title,
      status: l.status,
      price: l.price.toNumber(),
      currency: l.currency as CurrencyCode,
      countryCode: l.country.code as CountryCode,
      sellerId: l.sellerId,
      sellerName: l.seller.name,
      shopName: l.seller.sellerProfile?.shopName ?? null,
      thumbUrl: l.images[0] ? toImageDto(l.images[0]).thumbUrl : null,
      updatedAt: l.updatedAt.toISOString(),
    })),
    total,
    page,
  );
}

export async function setListingRemoved(
  admin: AuthUser,
  id: number,
  remove: boolean,
  input: unknown,
  req: Request,
) {
  const { reason } = adminReasonSchema.parse(input);
  const listing = await prisma.listing.findUnique({ where: { id } });
  if (!listing) throw AppError.notFound('Listing not found.');
  if (remove && listing.status === 'REMOVED')
    throw AppError.conflict('This listing is already removed.');
  if (!remove && listing.status !== 'REMOVED')
    throw AppError.conflict('Only removed listings can be restored.');
  // A restored listing goes back live if it was approved before, otherwise back to the seller as a draft.
  const to = remove
    ? 'REMOVED'
    : listing.publishedAt
      ? listing.quantity > 0
        ? 'ACTIVE'
        : 'SOLD'
      : 'DRAFT';

  await prisma.$transaction(async (tx) => {
    await tx.listing.update({ where: { id }, data: { status: to } });
    await recordAudit(
      {
        action: remove ? 'listing.remove' : 'listing.restore',
        targetType: 'listing',
        targetId: id,
        before: { status: listing.status },
        after: { status: to, reason },
        req,
      },
      tx,
    );
  });
  await notify(listing.sellerId, {
    type: remove ? 'listing.removed' : 'listing.restored',
    title: remove ? 'Your listing was removed' : 'Your listing was restored',
    body: `“${listing.title}” was ${remove ? 'removed' : 'restored'} by the TZed team. Reason: ${reason}`,
    link: remove ? '/help/contact' : `/listings/${id}`,
    email: true,
  });
  return to;
}

// ─── Reviews ─────────────────────────────────────────────────────────────────

export async function listReviews(query: Record<string, unknown>): Promise<Paged<AdminReviewRow>> {
  const page = pageOf(query.page);
  const q = text(query.q);
  const rating = Number(query.rating);
  const where: Prisma.ReviewWhereInput = {
    ...(q
      ? {
          OR: [
            { comment: { contains: q } },
            { reviewer: { email: { contains: q } } },
            { reviewer: { name: { contains: q } } },
            { seller: { email: { contains: q } } },
            { seller: { sellerProfile: { shopName: { contains: q } } } },
            ...(Number(q) ? [{ orderId: Number(q) }] : []),
          ],
        }
      : {}),
    ...(query.visibility === 'hidden'
      ? { hiddenAt: { not: null } }
      : query.visibility === 'visible'
        ? { hiddenAt: null }
        : {}),
    ...(rating >= 1 && rating <= 5 ? { rating } : {}),
    ...(Number(query.sellerId) ? { sellerId: Number(query.sellerId) } : {}),
  };
  const [rows, total] = await Promise.all([
    prisma.review.findMany({
      where,
      include: {
        reviewer: true,
        seller: { include: { sellerProfile: true } },
        order: { include: { items: { take: 1 } } },
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * PAGE,
      take: PAGE,
    }),
    prisma.review.count({ where }),
  ]);
  return paged(
    rows.map((r) => ({
      id: r.id,
      orderId: r.orderId,
      rating: r.rating,
      comment: r.comment,
      reviewerId: r.reviewerId,
      reviewerName: r.reviewer.name,
      sellerId: r.sellerId,
      sellerName: r.seller.sellerProfile?.shopName ?? r.seller.name,
      shopSlug: r.seller.sellerProfile?.slug ?? null,
      listingTitle: r.order.items[0]?.titleSnapshot ?? '',
      createdAt: r.createdAt.toISOString(),
      hiddenAt: r.hiddenAt?.toISOString() ?? null,
      hiddenReason: r.hiddenReason,
    })),
    total,
    page,
  );
}

/** Hide a review from the shop page and rating, or show it again. The reviewer is told why. */
export async function setReviewHidden(
  admin: AuthUser,
  id: number,
  hide: boolean,
  input: unknown,
  req: Request,
) {
  const { reason } = adminReasonSchema.parse(input);
  const review = await prisma.review.findUnique({
    where: { id },
    include: { order: { include: { items: { take: 1 } } } },
  });
  if (!review) throw AppError.notFound('Review not found.');
  if (hide && review.hiddenAt) throw AppError.conflict('This review is already hidden.');
  if (!hide && !review.hiddenAt) throw AppError.conflict('This review is not hidden.');

  await prisma.$transaction(async (tx) => {
    await tx.review.update({
      where: { id },
      data: hide
        ? { hiddenAt: new Date(), hiddenReason: reason }
        : { hiddenAt: null, hiddenReason: null },
    });
    await recordAudit(
      {
        action: hide ? 'review.hide' : 'review.unhide',
        targetType: 'review',
        targetId: id,
        before: {
          hidden: Boolean(review.hiddenAt),
          rating: review.rating,
          comment: review.comment,
        },
        after: { hidden: hide, reason },
        req,
      },
      tx,
    );
  });
  const title = review.order.items[0]?.titleSnapshot ?? `order #${review.orderId}`;
  await notify(review.reviewerId, {
    type: hide ? 'review.hidden' : 'review.unhidden',
    title: hide ? 'Your review was hidden' : 'Your review is visible again',
    body: hide
      ? `Your review for “${title}” was hidden from the shop page by the TZed team. Reason: ${reason}`
      : `Your review for “${title}” is back on the shop page. Note from the TZed team: ${reason}`,
    link: `/orders/${review.orderId}`,
    email: hide,
  });
}

// ─── Support tickets ─────────────────────────────────────────────────────────

export async function listTickets(query: Record<string, unknown>): Promise<Paged<AdminTicketRow>> {
  const page = pageOf(query.page);
  const status = ['OPEN', 'ANSWERED', 'CLOSED'].includes(String(query.status))
    ? (query.status as 'OPEN')
    : undefined;
  const q = text(query.q);
  const where: Prisma.SupportTicketWhereInput = {
    ...(status ? { status } : {}),
    ...(q
      ? {
          OR: [
            { subject: { contains: q } },
            { email: { contains: q } },
            ...(Number(q) ? [{ id: Number(q) }] : []),
          ],
        }
      : {}),
  };
  const [rows, total] = await Promise.all([
    prisma.supportTicket.findMany({
      where,
      include: { _count: { select: { messages: true } } },
      // Open tickets first, then by most recent activity.
      orderBy: [{ status: 'asc' }, { updatedAt: 'desc' }],
      skip: (page - 1) * PAGE,
      take: PAGE,
    }),
    prisma.supportTicket.count({ where }),
  ]);
  return paged(
    rows.map((t) => ({
      id: t.id,
      subject: t.subject,
      status: t.status,
      name: t.name,
      email: t.email,
      isGuest: t.userId === null,
      messages: t._count.messages,
      updatedAt: t.updatedAt.toISOString(),
    })),
    total,
    page,
  );
}

export async function replyToTicket(admin: AuthUser, id: number, input: unknown, req: Request) {
  const { body, close } = ticketStaffReplySchema.parse(input);
  const ticket = await prisma.supportTicket.findUnique({ where: { id }, include: { user: true } });
  if (!ticket) throw AppError.notFound('Ticket not found.');

  // Guests follow tickets with a private link. Only its hash is stored, so issue a fresh link with each reply.
  const token = ticket.userId ? null : randomToken();
  await prisma.$transaction(async (tx) => {
    await tx.ticketMessage.create({
      data: { ticketId: id, authorId: admin.id, isStaff: true, body },
    });
    await tx.supportTicket.update({
      where: { id },
      data: {
        status: close ? 'CLOSED' : 'ANSWERED',
        ...(token ? { accessTokenHash: hashToken(token) } : {}),
      },
    });
    await recordAudit(
      {
        action: 'ticket.reply',
        targetType: 'ticket',
        targetId: id,
        after: { closed: Boolean(close) },
        req,
      },
      tx,
    );
  });

  const path = `/support/tickets/${id}${token ? `?token=${encodeURIComponent(token)}` : ''}`;
  if (ticket.userId) {
    await notify(ticket.userId, {
      type: 'ticket.reply',
      title: `Support replied to #${id}`,
      body: ticket.subject,
      link: path,
    });
  }
  const owner = ticket.userId
    ? await prisma.user.findUnique({ where: { id: ticket.userId }, select: { locale: true } })
    : null;
  sendMailInBackground({
    to: ticket.email,
    subject: `Re: ${ticket.subject} [#${id}]`,
    ...renderEmail({
      locale: (owner?.locale ?? 'en') as Locale,
      name: ticket.name,
      paragraphs: [`TZed support replied to your ticket #${id}:`, body],
      action: { label: close ? 'View ticket' : 'Reply', path },
      note: token
        ? 'Use the link in this email (links in earlier emails no longer work).'
        : undefined,
    }),
  });
}

export async function closeTicket(admin: AuthUser, id: number, req: Request) {
  const ticket = await prisma.supportTicket.findUnique({ where: { id } });
  if (!ticket) throw AppError.notFound('Ticket not found.');
  await prisma.supportTicket.update({ where: { id }, data: { status: 'CLOSED' } });
  await recordAudit({
    action: 'ticket.close',
    targetType: 'ticket',
    targetId: id,
    before: { status: ticket.status },
    req,
  });
}

// ─── Exchange rate ───────────────────────────────────────────────────────────

export async function rateHistory() {
  const rows = await prisma.exchangeRate.findMany({
    where: { baseCurrency: 'ZMW', quoteCurrency: 'TZS' },
    include: { setBy: { select: { name: true } } },
    orderBy: [{ effectiveAt: 'desc' }, { id: 'desc' }],
    take: 50,
  });
  return rows.map((r) => ({
    id: r.id,
    rate: r.rate.toNumber(),
    note: r.note,
    setBy: r.setBy?.name ?? null,
    effectiveAt: r.effectiveAt.toISOString(),
  }));
}

export async function setRate(admin: AuthUser, input: unknown, req: Request) {
  const data = rateUpdateSchema.parse(input);
  const current = await prisma.exchangeRate.findFirst({
    where: { baseCurrency: 'ZMW', quoteCurrency: 'TZS' },
    orderBy: [{ effectiveAt: 'desc' }, { id: 'desc' }],
  });
  const before = current?.rate.toNumber();
  if (
    before &&
    Math.abs(data.rate - before) / before > LARGE_RATE_CHANGE &&
    !data.confirmLargeChange
  ) {
    throw new AppError(
      409,
      'LARGE_RATE_CHANGE',
      `That's a change of more than ${LARGE_RATE_CHANGE * 100}% from ${before}. Please confirm it's correct.`,
      {
        previous: before,
      },
    );
  }
  await prisma.$transaction(async (tx) => {
    await tx.exchangeRate.create({
      data: {
        baseCurrency: 'ZMW',
        quoteCurrency: 'TZS',
        rate: data.rate.toFixed(8),
        note: data.note || null,
        setById: admin.id,
      },
    });
    await recordAudit(
      {
        action: 'fx.update',
        targetType: 'exchange_rate',
        before: { rate: before ?? null },
        after: { rate: data.rate, note: data.note ?? null },
        req,
      },
      tx,
    );
  });
}

// ─── Categories & help articles ──────────────────────────────────────────────

async function uniqueSlug(base: string, taken: (slug: string) => Promise<boolean>) {
  const slug = slugify(base);
  for (let i = 1; ; i++) {
    const candidate = i === 1 ? slug : `${slug}-${i}`;
    if (!(await taken(candidate))) return candidate;
  }
}

export async function listCategories(): Promise<AdminCategoryRow[]> {
  const [rows, counts] = await Promise.all([
    prisma.category.findMany({ orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] }),
    prisma.listing.groupBy({
      by: ['categoryId'],
      where: { status: { in: ['ACTIVE', 'PENDING_REVIEW', 'SOLD'] } },
      _count: true,
    }),
  ]);
  const n = new Map(counts.map((c) => [c.categoryId, c._count]));
  return rows.map((c) => ({
    id: c.id,
    name: c.name,
    slug: c.slug,
    parentId: c.parentId,
    sortOrder: c.sortOrder,
    isActive: c.isActive,
    listings: n.get(c.id) ?? 0,
  }));
}

export async function saveCategory(
  admin: AuthUser,
  id: number | null,
  input: unknown,
  req: Request,
) {
  const data = categorySchema.parse(input);
  if (data.parentId) {
    const parent = await prisma.category.findUnique({ where: { id: data.parentId } });
    if (!parent || parent.parentId)
      throw AppError.badRequest('Choose a top-level category as the parent.');
    if (id && data.parentId === id)
      throw AppError.badRequest("A category can't be its own parent.");
  }
  const before = id ? await prisma.category.findUnique({ where: { id } }) : null;
  if (id && !before) throw AppError.notFound('Category not found.');
  if (id && data.parentId) {
    const children = await prisma.category.count({ where: { parentId: id } });
    if (children)
      throw AppError.badRequest('This category has subcategories, so it must stay top-level.');
  }

  const saved = await prisma.$transaction(async (tx) => {
    const row = id
      ? await tx.category.update({
          where: { id },
          data: {
            name: data.name,
            parentId: data.parentId ?? null,
            sortOrder: data.sortOrder,
            isActive: data.isActive,
          },
        })
      : await tx.category.create({
          data: {
            name: data.name,
            parentId: data.parentId ?? null,
            sortOrder: data.sortOrder ?? 99,
            isActive: data.isActive ?? true,
            slug: await uniqueSlug(data.name, async (s) =>
              Boolean(await tx.category.findUnique({ where: { slug: s } })),
            ),
          },
        });
    await recordAudit(
      {
        action: id ? 'category.update' : 'category.create',
        targetType: 'category',
        targetId: row.id,
        before: before
          ? { name: before.name, isActive: before.isActive, parentId: before.parentId }
          : undefined,
        after: { name: row.name, isActive: row.isActive, parentId: row.parentId },
        req,
      },
      tx,
    );
    return row;
  });
  return saved.id;
}

export async function listFaq(): Promise<AdminFaqRow[]> {
  const rows = await prisma.faqArticle.findMany({
    orderBy: [{ topic: 'asc' }, { sortOrder: 'asc' }],
  });
  return rows.map((a) => ({
    id: a.id,
    slug: a.slug,
    title: a.title,
    topic: a.topic,
    body: a.body,
    sortOrder: a.sortOrder,
    isPublished: a.isPublished,
    updatedAt: a.updatedAt.toISOString(),
  }));
}

export async function saveFaq(admin: AuthUser, id: number | null, input: unknown, req: Request) {
  const data = faqArticleSchema.parse(input);
  const before = id ? await prisma.faqArticle.findUnique({ where: { id } }) : null;
  if (id && !before) throw AppError.notFound('Article not found.');
  const row = await prisma.$transaction(async (tx) => {
    const saved = id
      ? await tx.faqArticle.update({ where: { id }, data })
      : await tx.faqArticle.create({
          data: {
            ...data,
            sortOrder: data.sortOrder ?? 99,
            slug: await uniqueSlug(data.title, async (s) =>
              Boolean(await tx.faqArticle.findUnique({ where: { slug: s } })),
            ),
          },
        });
    await recordAudit(
      {
        action: id ? 'faq.update' : 'faq.create',
        targetType: 'faq_article',
        targetId: saved.id,
        before: before ? { title: before.title, isPublished: before.isPublished } : undefined,
        after: { title: saved.title, isPublished: saved.isPublished },
        req,
      },
      tx,
    );
    return saved;
  });
  return row.id;
}

// ─── Audit log ───────────────────────────────────────────────────────────────

export async function auditLog(
  query: Record<string, unknown>,
): Promise<Paged<AuditLogRow> & { actions: string[] }> {
  const page = pageOf(query.page);
  const from = text(query.from) ? new Date(String(query.from)) : undefined;
  const to = text(query.to) ? new Date(`${String(query.to)}T23:59:59.999Z`) : undefined;
  const where: Prisma.AuditLogWhereInput = {
    ...(text(query.action) ? { action: text(query.action) } : {}),
    ...(Number(query.actorId) ? { actorId: Number(query.actorId) } : {}),
    ...(text(query.targetType) ? { targetType: text(query.targetType) } : {}),
    ...(Number(query.targetId) ? { targetId: Number(query.targetId) } : {}),
    // Admin actions only, unless security events are asked for.
    ...(query.include === 'all' ? {} : { NOT: { action: { startsWith: 'auth.' } } }),
    ...(from && !isNaN(+from)
      ? { createdAt: { gte: from, ...(to && !isNaN(+to) ? { lte: to } : {}) } }
      : to && !isNaN(+to)
        ? { createdAt: { lte: to } }
        : {}),
  };
  const [rows, total, actions] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      include: { actor: { select: { name: true } } },
      orderBy: { id: 'desc' },
      skip: (page - 1) * PAGE,
      take: PAGE,
    }),
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({
      distinct: ['action'],
      select: { action: true },
      orderBy: { action: 'asc' },
    }),
  ]);
  return {
    ...paged(
      rows.map((r) => ({
        id: r.id,
        action: r.action,
        actorId: r.actorId,
        actorName: r.actor?.name ?? null,
        targetType: r.targetType,
        targetId: r.targetId,
        before: r.before,
        after: r.after,
        ip: r.ip,
        createdAt: r.createdAt.toISOString(),
      })),
      total,
      page,
    ),
    actions: actions.map((a) => a.action),
  };
}
