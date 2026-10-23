import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { seedReferenceData } from '../../../prisma/seed.js';
import { createApp } from '../../app.js';
import { prisma } from '../../db.js';
import { testClient } from '../../test/client.js';
import { resetDb } from '../../test/db.js';
import { createListing, createSeller, createUser, TEST_PASSWORD } from '../../test/factories.js';

const app = createApp();

async function signIn(email: string) {
  const client = await testClient(app);
  expect((await client.post('/auth/login', { email, password: TEST_PASSWORD })).status).toBe(200);
  return client;
}

/** A seller with a listing, and a buyer whose order is completed. */
async function completedOrder(buyerName = 'Natasha Phiri') {
  const { user: seller } = await createSeller('TZ');
  await prisma.sellerProfile.update({
    where: { userId: seller.id },
    data: { slug: `shop-${seller.id}` },
  });
  const listing = await createListing(seller, { crossBorder: true, quantity: 10 });
  const buyer = await createUser({ countryCode: 'ZM', name: buyerName });
  const buyerClient = await signIn(buyer.email);
  const sellerClient = await signIn(seller.email);
  const id = (
    await buyerClient.post('/orders', {
      listingId: listing.id,
      quantity: 1,
      deliveryMethod: 'CROSS_BORDER',
    })
  ).body.order.id;
  await sellerClient.post(`/orders/${id}/accept`);
  return { seller, listing, buyer, buyerClient, sellerClient, id, slug: `shop-${seller.id}` };
}

beforeEach(async () => {
  await resetDb();
  await seedReferenceData(prisma);
});

describe('reviews', () => {
  it('lets the buyer review a completed order once, and notifies the seller', async () => {
    const { id, seller, buyerClient, sellerClient } = await completedOrder();
    expect((await buyerClient.post(`/orders/${id}/review`, { rating: 5 })).status).toBe(409); // not completed yet
    await sellerClient.post(`/orders/${id}/complete`);
    expect((await buyerClient.get(`/orders/${id}`)).body.order).toMatchObject({
      canReview: true,
      review: null,
    });

    const res = await buyerClient.post(`/orders/${id}/review`, {
      rating: 4,
      comment: 'Arrived in Lusaka in 4 days. Well packed.',
    });
    expect(res.status).toBe(201);
    expect((await buyerClient.get(`/orders/${id}`)).body.order).toMatchObject({
      canReview: false,
      review: { rating: 4, comment: 'Arrived in Lusaka in 4 days. Well packed.' },
    });
    expect((await buyerClient.post(`/orders/${id}/review`, { rating: 1 })).status).toBe(409);
    const n = await prisma.notification.findFirstOrThrow({
      where: { userId: seller.id, type: 'review.new' },
    });
    expect(n.body).toContain('Natasha P. rated you ★★★★☆');
  });

  it('refuses reviews from the seller or strangers, and invalid ratings', async () => {
    const { id, sellerClient, buyerClient } = await completedOrder();
    await sellerClient.post(`/orders/${id}/complete`);
    expect((await sellerClient.post(`/orders/${id}/review`, { rating: 5 })).status).toBe(403);
    const stranger = await signIn((await createUser()).email);
    expect((await stranger.post(`/orders/${id}/review`, { rating: 5 })).status).toBe(404);
    expect((await buyerClient.post(`/orders/${id}/review`, { rating: 0 })).status).toBe(400);
    expect((await buyerClient.post(`/orders/${id}/review`, { rating: 5.5 })).status).toBe(400);
  });

  it('counts a review once even if submitted twice at the same moment', async () => {
    const { id, sellerClient, buyerClient } = await completedOrder();
    await sellerClient.post(`/orders/${id}/complete`);
    const results = await Promise.all([
      buyerClient.post(`/orders/${id}/review`, { rating: 5 }),
      buyerClient.post(`/orders/${id}/review`, { rating: 5 }),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(await prisma.review.count()).toBe(1);
  });

  it('shows the seller rating on the shop, the listing and in search', async () => {
    const first = await completedOrder('Natasha Phiri');
    await first.sellerClient.post(`/orders/${first.id}/complete`);
    await first.buyerClient.post(`/orders/${first.id}/review`, { rating: 5, comment: 'Excellent' });
    // A second buyer, same seller and listing.
    const buyer2 = await createUser({ countryCode: 'TZ', name: 'Baraka Said' });
    const b2 = await signIn(buyer2.email);
    const id2 = (
      await b2.post('/orders', {
        listingId: first.listing.id,
        quantity: 1,
        deliveryMethod: 'PICKUP',
      })
    ).body.order.id;
    await first.sellerClient.post(`/orders/${id2}/accept`);
    await first.sellerClient.post(`/orders/${id2}/complete`);
    await b2.post(`/orders/${id2}/review`, { rating: 4 });

    const reviews = await request(app).get(`/api/v1/shops/${first.slug}/reviews`);
    expect(reviews.body).toMatchObject({
      rating: { average: 4.5, count: 2 },
      breakdown: { 5: 1, 4: 1, 3: 0, 2: 0, 1: 0 },
      page: 1,
      pageCount: 1,
    });
    expect(
      reviews.body.reviews.map(
        (r: { reviewerName: string; reviewerCountry: string }) =>
          `${r.reviewerName} ${r.reviewerCountry}`,
      ),
    ).toEqual(['Baraka S. TZ', 'Natasha P. ZM']);

    expect((await request(app).get(`/api/v1/shops/${first.slug}`)).body.shop.rating).toEqual({
      average: 4.5,
      count: 2,
    });
    expect(
      (await request(app).get(`/api/v1/listings/${first.listing.id}`)).body.listing.seller.rating,
    ).toEqual({ average: 4.5, count: 2 });
    const search = await request(app).get('/api/v1/search');
    expect(search.body.results[0].sellerRating).toEqual({ average: 4.5, count: 2 });
  });

  it('has no rating for sellers without reviews, and hides deleted reviewers’ names', async () => {
    const { id, buyer, sellerClient, buyerClient, slug, listing } = await completedOrder();
    expect(
      (await request(app).get(`/api/v1/listings/${listing.id}`)).body.listing.seller.rating,
    ).toBeNull();
    await sellerClient.post(`/orders/${id}/complete`);
    await buyerClient.post(`/orders/${id}/review`, { rating: 3 });
    await prisma.user.update({
      where: { id: buyer.id },
      data: { status: 'DELETED', name: 'Deleted user' },
    });
    const reviews = await request(app).get(`/api/v1/shops/${slug}/reviews`);
    expect(reviews.body.reviews[0].reviewerName).toBe('Deleted user');
  });
});
