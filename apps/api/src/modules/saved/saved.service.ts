import { formatMoney, type CurrencyCode, type ListingSummary } from '@tzed/shared';
import { prisma } from '../../db.js';
import { AppError } from '../../lib/errors.js';
import type { AuthUser } from '../../middleware/auth.js';
import { listingSummaryInclude, toListingSummary } from '../listings/listing-dto.js';
import { notify } from '../notifications/notifications.service.js';
import { sellerRatings } from '../reviews/reviews.service.js';

export const MAX_SAVED = 200;
/** Most listings the "recently viewed" strip asks for at once. */
export const MAX_BY_IDS = 24;

async function withRatings(listings: ListingSummary[], sellerIds: number[]) {
  const ratings = await sellerRatings(sellerIds);
  return listings.map((l, i) => ({ ...l, sellerRating: ratings.get(sellerIds[i]!) ?? null }));
}

/** The user's saved listings, newest first. Sold or removed ones stay, marked by their status. */
export async function listSaved(user: AuthUser) {
  const rows = await prisma.savedListing.findMany({
    where: { userId: user.id, listing: { status: { not: 'DRAFT' } } },
    include: { listing: { include: listingSummaryInclude } },
    orderBy: { createdAt: 'desc' },
    take: MAX_SAVED,
  });
  const listings = await withRatings(
    rows.map((r) => toListingSummary(r.listing)),
    rows.map((r) => r.listing.sellerId),
  );
  return { listings, ids: rows.map((r) => r.listingId) };
}

export async function saveListing(user: AuthUser, listingId: number) {
  const listing = await prisma.listing.findUnique({ where: { id: listingId } });
  if (!listing || listing.status !== 'ACTIVE') throw AppError.notFound('Listing not found.');
  const exists = await prisma.savedListing.findUnique({
    where: { userId_listingId: { userId: user.id, listingId } },
  });
  if (exists) return;
  if ((await prisma.savedListing.count({ where: { userId: user.id } })) >= MAX_SAVED) {
    throw AppError.conflict(`You can save up to ${MAX_SAVED} items. Remove some first.`);
  }
  await prisma.savedListing.create({ data: { userId: user.id, listingId } });
}

export async function unsaveListing(user: AuthUser, listingId: number) {
  await prisma.savedListing.deleteMany({ where: { userId: user.id, listingId } });
}

/** Live listings by id, in the order asked (for "Recently viewed", kept on the device). */
export async function listingsByIds(ids: number[]) {
  const wanted = [...new Set(ids)].slice(0, MAX_BY_IDS);
  if (!wanted.length) return [];
  const rows = await prisma.listing.findMany({
    where: { id: { in: wanted }, status: 'ACTIVE' },
    include: listingSummaryInclude,
  });
  const byId = new Map(rows.map((r) => [r.id, r]));
  const ordered = wanted.flatMap((id) => (byId.has(id) ? [byId.get(id)!] : []));
  return withRatings(
    ordered.map(toListingSummary),
    ordered.map((r) => r.sellerId),
  );
}

/** Tells everyone who saved a listing that its approved price went down. */
export async function notifyPriceDrop(
  listing: { id: number; title: string; sellerId: number; currency: string },
  from: number,
  to: number,
) {
  const savers = await prisma.savedListing.findMany({
    where: { listingId: listing.id, userId: { not: listing.sellerId }, user: { status: 'ACTIVE' } },
    select: { userId: true },
  });
  const currency = listing.currency as CurrencyCode;
  for (const { userId } of savers) {
    await notify(userId, {
      type: 'saved.price_drop',
      title: 'Price drop on a saved item',
      body: `“${listing.title}” is now ${formatMoney(to, currency)} (was ${formatMoney(from, currency)}).`,
      link: `/listings/${listing.id}`,
    });
  }
}
