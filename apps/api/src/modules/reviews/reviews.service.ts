import {
  reviewSchema,
  shortName,
  type CountryCode,
  type ReviewsResponse,
  type SellerRating,
} from '@tzed/shared';
import { prisma } from '../../db.js';
import { AppError } from '../../lib/errors.js';
import type { AuthUser } from '../../middleware/auth.js';
import { notify } from '../notifications/notifications.service.js';

const PAGE = 10;

/** Average rating (1 decimal) and count for each seller, in one query. */
export async function sellerRatings(sellerIds: number[]): Promise<Map<number, SellerRating>> {
  const ids = [...new Set(sellerIds)];
  if (!ids.length) return new Map();
  const rows = await prisma.review.groupBy({
    by: ['sellerId'],
    where: { sellerId: { in: ids } },
    _avg: { rating: true },
    _count: true,
  });
  return new Map(
    rows.map((r) => [
      r.sellerId,
      { average: Math.round((r._avg.rating ?? 0) * 10) / 10, count: r._count },
    ]),
  );
}

export async function sellerRating(sellerId: number) {
  return (await sellerRatings([sellerId])).get(sellerId) ?? null;
}

/** The buyer of a completed order rates the seller, once. */
export async function createReview(user: AuthUser, orderId: number, input: unknown) {
  const data = reviewSchema.parse(input);
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { items: true, review: true },
  });
  if (!order || (order.buyerId !== user.id && order.sellerId !== user.id))
    throw AppError.notFound('Order not found.');
  if (order.buyerId !== user.id) throw AppError.forbidden('Only the buyer can review this order.');
  if (order.status !== 'COMPLETED')
    throw AppError.conflict('You can review the seller once the order is completed.');
  if (order.review) throw AppError.conflict('You have already reviewed this order.');

  try {
    await prisma.review.create({
      data: {
        orderId,
        reviewerId: user.id,
        sellerId: order.sellerId,
        rating: data.rating,
        comment: data.comment,
      },
    });
  } catch (err) {
    // Unique order id: a second review submitted at the same moment.
    if ((err as { code?: string }).code === 'P2002')
      throw AppError.conflict('You have already reviewed this order.');
    throw err;
  }

  const stars = '★'.repeat(data.rating) + '☆'.repeat(5 - data.rating);
  await notify(order.sellerId, {
    type: 'review.new',
    title: `New ${data.rating}-star review`,
    body: `${shortName(user.name)} rated you ${stars} for “${order.items[0]?.titleSnapshot}”.${data.comment ? ` “${data.comment}”` : ''}`,
    link: `/orders/${orderId}`,
  });
}

export async function listSellerReviews(slug: string, page: number): Promise<ReviewsResponse> {
  const profile = await prisma.sellerProfile.findUnique({ where: { slug } });
  if (!profile) throw AppError.notFound('Shop not found.');
  const where = { sellerId: profile.userId };
  const [rows, total, grouped, rating] = await Promise.all([
    prisma.review.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * PAGE,
      take: PAGE,
      include: {
        reviewer: { include: { country: true } },
        order: { include: { items: { take: 1 } } },
      },
    }),
    prisma.review.count({ where }),
    prisma.review.groupBy({ by: ['rating'], where, _count: true }),
    sellerRating(profile.userId),
  ]);
  const breakdown = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } as ReviewsResponse['breakdown'];
  for (const g of grouped) breakdown[g.rating as 1 | 2 | 3 | 4 | 5] = g._count;

  return {
    reviews: rows.map((r) => ({
      id: r.id,
      rating: r.rating,
      comment: r.comment,
      reviewerName: r.reviewer.status === 'DELETED' ? 'Deleted user' : shortName(r.reviewer.name),
      reviewerCountry: r.reviewer.country.code as CountryCode,
      listingTitle: r.order.items[0]?.titleSnapshot ?? '',
      createdAt: r.createdAt.toISOString(),
    })),
    rating,
    breakdown,
    page,
    pageCount: Math.max(1, Math.ceil(total / PAGE)),
  };
}
