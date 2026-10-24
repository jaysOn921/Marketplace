import type { Request } from 'express';
import { rejectListingSchema, type ReviewQueueItem } from '@tzed/shared';
import { prisma } from '../../db.js';
import { AppError } from '../../lib/errors.js';
import type { AuthUser } from '../../middleware/auth.js';
import { recordAudit } from '../audit/audit.service.js';
import { listingDetailInclude, toListingDetail } from '../listings/listing-dto.js';
import { notify } from '../notifications/notifications.service.js';
import { notifyPriceDrop } from '../saved/saved.service.js';

/** Listings waiting for an admin, oldest first. */
export async function reviewQueue(admin: AuthUser): Promise<ReviewQueueItem[]> {
  const rows = await prisma.listing.findMany({
    where: { status: 'PENDING_REVIEW' },
    orderBy: [{ submittedAt: 'asc' }, { id: 'asc' }],
    include: {
      ...listingDetailInclude,
      reviewEvents: {
        orderBy: { createdAt: 'asc' },
        include: { actor: { select: { name: true } } },
      },
    },
  });
  return rows.map((l) => ({
    ...toListingDetail(l, admin),
    sellerAccount: {
      id: l.seller.id,
      name: l.seller.name,
      email: l.seller.email,
      createdAt: l.seller.createdAt.toISOString(),
    },
    wasPublished: l.publishedAt !== null,
    history: l.reviewEvents.map((e) => ({
      decision: e.decision,
      reason: e.reason,
      actorName: e.actor?.name ?? null,
      createdAt: e.createdAt.toISOString(),
    })),
  }));
}

export async function pendingCount() {
  return prisma.listing.count({ where: { status: 'PENDING_REVIEW' } });
}

async function decide(
  admin: AuthUser,
  id: number,
  decision: 'APPROVED' | 'REJECTED',
  req: Request,
  reason?: string,
) {
  const listing = await prisma.listing.findUnique({ where: { id } });
  if (!listing) throw AppError.notFound('Listing not found.');

  await prisma.$transaction(async (tx) => {
    // Only act on listings that are still pending (another admin may have decided already).
    const { count } = await tx.listing.updateMany({
      where: { id, status: 'PENDING_REVIEW' },
      data:
        decision === 'APPROVED'
          ? {
              status: 'ACTIVE',
              rejectionReason: null,
              publishedAt: listing.publishedAt ?? new Date(),
              approvedPrice: listing.price,
            }
          : { status: 'REJECTED', rejectionReason: reason },
    });
    if (count === 0) throw AppError.conflict('This listing is no longer waiting for review.');

    await tx.listingReviewEvent.create({
      data: { listingId: id, actorId: admin.id, decision, reason: reason ?? null },
    });
    await recordAudit(
      {
        action: decision === 'APPROVED' ? 'listing.approve' : 'listing.reject',
        targetType: 'listing',
        targetId: id,
        before: { status: listing.status },
        after: {
          status: decision === 'APPROVED' ? 'ACTIVE' : 'REJECTED',
          ...(reason ? { reason } : {}),
        },
        req,
      },
      tx,
    );
  });

  await notify(
    listing.sellerId,
    decision === 'APPROVED'
      ? {
          type: 'listing.approved',
          title: 'Your listing is live',
          body: `“${listing.title}” was approved and is now visible to buyers.`,
          link: `/listings/${id}`,
          email: true,
        }
      : {
          type: 'listing.rejected',
          title: 'Your listing needs changes',
          body: `“${listing.title}” was not approved. Reason: ${reason}\nEdit the listing and submit it again.`,
          link: `/listings/${id}/edit`,
          email: true,
        },
  );
  // Approved again at a lower price: tell the people who saved it.
  if (
    decision === 'APPROVED' &&
    listing.approvedPrice &&
    listing.price.lessThan(listing.approvedPrice)
  ) {
    await notifyPriceDrop(listing, listing.approvedPrice.toNumber(), listing.price.toNumber());
  }
}

export function approveListing(admin: AuthUser, id: number, req: Request) {
  return decide(admin, id, 'APPROVED', req);
}

export function rejectListing(admin: AuthUser, id: number, input: unknown, req: Request) {
  const { reason } = rejectListingSchema.parse(input);
  return decide(admin, id, 'REJECTED', req, reason);
}
