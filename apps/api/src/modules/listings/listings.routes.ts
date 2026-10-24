import { Router } from 'express';
import { recordListingView } from '../analytics/listing-stats.js';
import multer from 'multer';
import {
  MAX_IMAGE_BYTES,
  MAX_LISTING_IMAGES,
  type CategoryNode,
  type ListingResponse,
  type ListingStatus,
  type MyListingsResponse,
} from '@tzed/shared';
import { prisma } from '../../db.js';
import { idParam } from '../../lib/params.js';
import { currentUser, requireAuth } from '../../middleware/auth.js';
import { listingSummaryInclude, toListingDetail, toListingSummary } from './listing-dto.js';
import { sellerRating } from '../reviews/reviews.service.js';
import * as listings from './listings.service.js';

export const listingsRouter = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_IMAGE_BYTES, files: MAX_LISTING_IMAGES },
});

listingsRouter.get('/categories', async (_req, res) => {
  const rows = await prisma.category.findMany({
    where: { isActive: true },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
  });
  const node = (c: (typeof rows)[number]): CategoryNode => ({
    id: c.id,
    name: c.name,
    slug: c.slug,
    children: rows.filter((r) => r.parentId === c.id).map(node),
  });
  res
    .set('Cache-Control', 'public, max-age=300')
    .json({ categories: rows.filter((c) => !c.parentId).map(node) });
});

listingsRouter.get('/listings/mine', requireAuth, async (req, res) => {
  const user = currentUser(req);
  const status = req.query.status as ListingStatus | undefined;
  const [rows, grouped] = await Promise.all([
    prisma.listing.findMany({
      where: { sellerId: user.id, status: status ?? { not: 'REMOVED' } },
      include: listingSummaryInclude,
      orderBy: { updatedAt: 'desc' },
    }),
    prisma.listing.groupBy({
      by: ['status'],
      where: { sellerId: user.id, status: { not: 'REMOVED' } },
      _count: true,
    }),
  ]);
  const body: MyListingsResponse = {
    listings: rows.map(toListingSummary),
    counts: Object.fromEntries(grouped.map((g) => [g.status, g._count])),
  };
  res.set('Cache-Control', 'no-store').json(body);
});

listingsRouter.post('/listings', requireAuth, async (req, res) => {
  const user = currentUser(req);
  const listing = await listings.createListing(user, req.body);
  const body: ListingResponse = { listing: toListingDetail(listing, user) };
  res.status(201).json(body);
});

listingsRouter.get('/listings/:id', async (req, res) => {
  const listing = await listings.getVisibleListing(idParam(req.params.id), req);
  if (listing.status === 'ACTIVE')
    await recordListingView(listing, req.user, req.ip, req.get('user-agent'));
  const body: ListingResponse = {
    listing: toListingDetail(listing, req.user, await sellerRating(listing.sellerId)),
  };
  res.set('Cache-Control', 'no-store').json(body);
});

listingsRouter.patch('/listings/:id', requireAuth, async (req, res) => {
  const user = currentUser(req);
  const { listing, sentForReview } = await listings.updateListing(
    user,
    idParam(req.params.id),
    req.body,
  );
  const body: ListingResponse = { listing: toListingDetail(listing, user), sentForReview };
  res.json(body);
});

listingsRouter.post('/listings/:id/submit', requireAuth, async (req, res) => {
  const user = currentUser(req);
  const listing = await listings.submitForReview(user, idParam(req.params.id));
  res.json({ listing: toListingDetail(listing, user) } satisfies ListingResponse);
});

listingsRouter.post('/listings/:id/mark-sold', requireAuth, async (req, res) => {
  const user = currentUser(req);
  const listing = await listings.setSold(user, idParam(req.params.id), true);
  res.json({ listing: toListingDetail(listing, user) } satisfies ListingResponse);
});

listingsRouter.post('/listings/:id/mark-available', requireAuth, async (req, res) => {
  const user = currentUser(req);
  const listing = await listings.setSold(user, idParam(req.params.id), false);
  res.json({ listing: toListingDetail(listing, user) } satisfies ListingResponse);
});

listingsRouter.delete('/listings/:id', requireAuth, async (req, res) => {
  await listings.deleteListing(currentUser(req), idParam(req.params.id));
  res.status(204).end();
});

listingsRouter.post(
  '/listings/:id/images',
  requireAuth,
  upload.array('images', MAX_LISTING_IMAGES),
  async (req, res) => {
    const user = currentUser(req);
    const files = (req.files as Express.Multer.File[] | undefined) ?? [];
    const { listing, sentForReview } = await listings.addImages(
      user,
      idParam(req.params.id),
      files,
    );
    res
      .status(201)
      .json({ listing: toListingDetail(listing, user), sentForReview } satisfies ListingResponse);
  },
);

listingsRouter.delete('/listings/:id/images/:imageId', requireAuth, async (req, res) => {
  const user = currentUser(req);
  const listing = await listings.deleteImage(
    user,
    idParam(req.params.id),
    idParam(req.params.imageId),
  );
  res.json({ listing: toListingDetail(listing, user) } satisfies ListingResponse);
});

listingsRouter.put('/listings/:id/images/order', requireAuth, async (req, res) => {
  const user = currentUser(req);
  const listing = await listings.reorderImages(user, idParam(req.params.id), req.body);
  res.json({ listing: toListingDetail(listing, user) } satisfies ListingResponse);
});
