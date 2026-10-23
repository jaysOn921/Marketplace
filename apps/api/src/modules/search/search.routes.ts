import { Router } from 'express';
import { searchQuerySchema, type ShopResponse, type SuggestResponse } from '@tzed/shared';
import { prisma } from '../../db.js';
import { AppError } from '../../lib/errors.js';
import { sellerRating } from '../reviews/reviews.service.js';
import { searchListings, suggest } from './search.service.js';

export const searchRouter = Router();

searchRouter.get('/search', async (req, res) => {
  const query = searchQuerySchema.parse(req.query);
  res.set('Cache-Control', 'no-store').json(await searchListings(query));
});

searchRouter.get('/search/suggest', async (req, res) => {
  const q = typeof req.query.q === 'string' ? req.query.q.slice(0, 100) : undefined;
  const body: SuggestResponse = await suggest(q);
  res.set('Cache-Control', 'public, max-age=30').json(body);
});

searchRouter.get('/shops/:slug', async (req, res) => {
  const profile = await prisma.sellerProfile.findUnique({
    where: { slug: String(req.params.slug) },
    include: { region: true, user: { include: { country: true } } },
  });
  if (!profile || profile.user.status !== 'ACTIVE') throw AppError.notFound('Shop not found.');
  const activeListings = await prisma.listing.count({
    where: { sellerId: profile.userId, status: 'ACTIVE' },
  });
  const body: ShopResponse = {
    shop: {
      userId: profile.userId,
      shopName: profile.shopName,
      slug: profile.slug,
      bio: profile.bio,
      town: profile.town,
      regionName: profile.region?.name ?? null,
      countryCode: profile.user.country.code as 'TZ' | 'ZM',
      memberSince: profile.user.createdAt.toISOString(),
      activeListings,
      rating: await sellerRating(profile.userId),
    },
  };
  res.json(body);
});
