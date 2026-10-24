import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { seedReferenceData } from '../../../prisma/seed.js';
import { createApp } from '../../app.js';
import { prisma } from '../../db.js';
import { testClient } from '../../test/client.js';
import { resetDb } from '../../test/db.js';
import {
  auditActions,
  createListing,
  createSeller,
  createUser,
  TEST_PASSWORD,
} from '../../test/factories.js';
import { replyTime, replyTimeBucket } from './trust.service.js';

const app = createApp();
const MIN = 60 * 1000;
const ago = (minutes: number) => new Date(Date.now() - minutes * MIN);

async function signIn(email: string) {
  const client = await testClient(app);
  expect((await client.post('/auth/login', { email, password: TEST_PASSWORD })).status).toBe(200);
  return client;
}

/** A conversation with messages at given times: [who, minutes ago]. */
async function conversation(
  sellerId: number,
  listingId: number,
  messages: ['buyer' | 'seller', number][],
) {
  const buyer = await createUser({ countryCode: 'ZM' });
  const c = await prisma.conversation.create({
    data: { listingId, buyerId: buyer.id, sellerId },
  });
  await prisma.message.createMany({
    data: messages.map(([who, minutesAgo]) => ({
      conversationId: c.id,
      senderId: who === 'buyer' ? buyer.id : sellerId,
      body: 'Hello',
      createdAt: ago(minutesAgo),
    })),
  });
}

beforeEach(async () => {
  await resetDb();
  await seedReferenceData(prisma);
});

describe('reply time', () => {
  it('puts the median reply into plain-language buckets', () => {
    expect([30, 60, 61, 360, 361, 1440, 1441].map(replyTimeBucket)).toEqual([
      'HOUR',
      'HOUR',
      'HOURS',
      'HOURS',
      'DAY',
      'DAY',
      'DAYS',
    ]);
  });

  it('needs three replies, and times each run of buyer messages from its first one', async () => {
    const { user: seller } = await createSeller('TZ');
    const listing = await createListing(seller);
    await conversation(seller.id, listing.id, [
      ['buyer', 600],
      ['buyer', 590], // same run: still timed from the first message
      ['seller', 540], // 60 minutes after the first
      ['buyer', 300],
      ['seller', 280], // 20 minutes
    ]);
    expect(await replyTime(seller.id)).toBeNull(); // only two replies so far
    await conversation(seller.id, listing.id, [
      ['buyer', 200],
      ['seller', 150], // 50 minutes
    ]);
    expect(await replyTime(seller.id)).toBe('HOUR'); // median of 20, 50, 60
  });

  it('counts messages left unanswered for over a day as slow, but not recent ones', async () => {
    const { user: seller } = await createSeller('TZ');
    const listing = await createListing(seller);
    await conversation(seller.id, listing.id, [['buyer', 3 * 24 * 60]]);
    await conversation(seller.id, listing.id, [['buyer', 2 * 24 * 60]]);
    await conversation(seller.id, listing.id, [
      ['buyer', 100],
      ['seller', 90],
    ]);
    await conversation(seller.id, listing.id, [['buyer', 10]]); // still waiting, not counted
    expect(await replyTime(seller.id)).toBe('DAYS');
  });
});

describe('seller trust on listings and shops', () => {
  it('shows completed sales and the verified badge, which only admins give', async () => {
    const { user: seller } = await createSeller('TZ');
    await prisma.sellerProfile.update({ where: { userId: seller.id }, data: { slug: 'amina' } });
    const listing = await createListing(seller, { quantity: 5 });
    const buyer = await signIn((await createUser({ countryCode: 'TZ' })).email);
    for (let i = 0; i < 2; i++) {
      const id = (
        await buyer.post('/orders', {
          listingId: listing.id,
          quantity: 1,
          deliveryMethod: 'PICKUP',
        })
      ).body.order.id;
      await prisma.order.update({ where: { id }, data: { status: 'COMPLETED' } });
    }

    const before = (await request(app).get(`/api/v1/listings/${listing.id}`)).body.listing;
    expect(before.seller.trust).toEqual({ verified: false, completedOrders: 2, replyTime: null });
    expect(before.sellerVerified).toBe(false);

    const admin = await signIn((await createUser({ role: 'ADMIN' })).email);
    expect(
      (await buyer.post(`/admin/users/${seller.id}/verify`, { reason: 'ID checked' })).status,
    ).toBe(403);
    expect((await admin.post(`/admin/users/${seller.id}/verify`, {})).status).toBe(400);
    expect(
      (await admin.post(`/admin/users/${seller.id}/verify`, { reason: 'NIDA ID and shop checked' }))
        .status,
    ).toBe(200);
    expect((await admin.post(`/admin/users/${seller.id}/verify`, { reason: 'again' })).status).toBe(
      409,
    );
    const nonSeller = await createUser();
    expect(
      (await admin.post(`/admin/users/${nonSeller.id}/verify`, { reason: 'ID checked' })).status,
    ).toBe(404);

    expect(
      (await request(app).get(`/api/v1/listings/${listing.id}`)).body.listing.seller.trust,
    ).toMatchObject({ verified: true });
    expect((await request(app).get('/api/v1/shops/amina')).body.shop.trust).toEqual({
      verified: true,
      completedOrders: 2,
      replyTime: null,
    });
    const search = (await request(app).get('/api/v1/search')).body;
    expect(search.results[0].sellerVerified).toBe(true);
    expect(
      await prisma.notification.findFirst({
        where: { userId: seller.id, type: 'seller.verified' },
      }),
    ).not.toBeNull();
    const users = (await admin.get('/admin/users?q=Shop')).body.rows;
    expect(users.find((u: { id: number }) => u.id === seller.id).verifiedAt).toEqual(
      expect.any(String),
    );

    await admin.post(`/admin/users/${seller.id}/unverify`, { reason: 'Shop details changed' });
    expect(
      (await request(app).get(`/api/v1/listings/${listing.id}`)).body.listing.sellerVerified,
    ).toBe(false);
    expect(await auditActions()).toEqual(
      expect.arrayContaining(['seller.verify', 'seller.unverify']),
    );
  });
});
