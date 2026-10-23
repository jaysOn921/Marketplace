import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { seedReferenceData } from '../../../prisma/seed.js';
import { createApp } from '../../app.js';
import { prisma } from '../../db.js';
import { testOutbox } from '../../lib/mailer.js';
import { testClient } from '../../test/client.js';
import { resetDb } from '../../test/db.js';
import { categories, createSeller, createUser, TEST_PASSWORD } from '../../test/factories.js';

const app = createApp();

async function signIn(email: string) {
  const client = await testClient(app);
  await client.post('/auth/login', { email, password: TEST_PASSWORD });
  return client;
}

/** A listing waiting for review, created directly in the database. */
async function pendingListing(title = 'Kitenge fabric, 6 yards', submittedAt = new Date()) {
  const { user, region } = await createSeller('TZ');
  const { leafId } = await categories();
  const listing = await prisma.listing.create({
    data: {
      sellerId: user.id,
      categoryId: leafId,
      title,
      description: 'High quality cotton kitenge in assorted prints.',
      price: '25000',
      currency: 'TZS',
      condition: 'NEW',
      countryId: user.countryId,
      regionId: region.id,
      town: 'Mbeya',
      status: 'PENDING_REVIEW',
      submittedAt,
      shipTo: { create: [{ countryId: user.countryId }] },
      images: { create: [{ storageKey: 'listings/x/abc', width: 10, height: 10 }] },
      reviewEvents: { create: [{ actorId: user.id, decision: 'SUBMITTED' }] },
    },
  });
  return { listing, seller: user };
}

let admin: Awaited<ReturnType<typeof testClient>>;
let adminId: number;

beforeEach(async () => {
  await resetDb();
  await seedReferenceData(prisma);
  testOutbox.length = 0;
  const a = await createUser({ role: 'ADMIN', name: 'Admin Asha' });
  adminId = a.id;
  admin = await signIn(a.email);
});

describe('review queue', () => {
  it('is for admins only', async () => {
    const user = await signIn((await createUser()).email);
    expect((await user.get('/admin/listings/review-queue')).status).toBe(403);
    expect((await request(app).get('/api/v1/admin/listings/review-queue')).status).toBe(401);
  });

  it('lists pending listings oldest first, with seller details and history', async () => {
    await pendingListing('Newer listing title', new Date());
    const { seller } = await pendingListing(
      'Older listing title',
      new Date(Date.now() - 3_600_000),
    );

    const res = await admin.get('/admin/listings/review-queue');
    expect(res.body.listings.map((l: { title: string }) => l.title)).toEqual([
      'Older listing title',
      'Newer listing title',
    ]);
    expect(res.body.listings[0]).toMatchObject({
      sellerAccount: { id: seller.id, email: seller.email },
      wasPublished: false,
      history: [{ decision: 'SUBMITTED' }],
    });
    expect((await admin.get('/admin/listings/review-queue/count')).body.count).toBe(2);
  });
});

describe('approve and reject', () => {
  it('approving makes the listing live, logs it, and notifies the seller', async () => {
    const { listing, seller } = await pendingListing();
    expect((await request(app).get(`/api/v1/listings/${listing.id}`)).status).toBe(404);

    expect((await admin.post(`/admin/listings/${listing.id}/approve`)).status).toBe(200);

    const row = await prisma.listing.findUniqueOrThrow({ where: { id: listing.id } });
    expect(row.status).toBe('ACTIVE');
    expect(row.publishedAt).not.toBeNull();
    expect((await request(app).get(`/api/v1/listings/${listing.id}`)).status).toBe(200);

    const audit = await prisma.auditLog.findFirstOrThrow({ where: { action: 'listing.approve' } });
    expect(audit).toMatchObject({ actorId: adminId, targetType: 'listing', targetId: listing.id });
    expect(
      await prisma.notification.findFirst({
        where: { userId: seller.id, type: 'listing.approved' },
      }),
    ).not.toBeNull();
    expect(testOutbox.at(-1)).toMatchObject({
      to: seller.email,
      subject: expect.stringContaining('live'),
    });

    // A second decision on the same listing is refused.
    expect((await admin.post(`/admin/listings/${listing.id}/approve`)).status).toBe(409);
  });

  it('rejecting needs a reason that the seller can see, and the seller can resubmit', async () => {
    const { listing, seller } = await pendingListing();
    expect((await admin.post(`/admin/listings/${listing.id}/reject`, { reason: '' })).status).toBe(
      400,
    );

    const reason = 'Please add a photo of the actual fabric, not a stock image.';
    expect((await admin.post(`/admin/listings/${listing.id}/reject`, { reason })).status).toBe(200);
    const audit = await prisma.auditLog.findFirstOrThrow({ where: { action: 'listing.reject' } });
    expect(audit.after).toMatchObject({ status: 'REJECTED', reason });

    const sellerClient = await signIn(seller.email);
    const own = await sellerClient.get(`/listings/${listing.id}`);
    expect(own.body.listing).toMatchObject({ status: 'REJECTED', rejectionReason: reason });
    expect(testOutbox.at(-1)?.text).toContain(reason);

    expect((await sellerClient.post(`/listings/${listing.id}/submit`)).body.listing.status).toBe(
      'PENDING_REVIEW',
    );
    const queue = (await admin.get('/admin/listings/review-queue')).body.listings;
    expect(queue[0].history.map((h: { decision: string }) => h.decision)).toEqual([
      'SUBMITTED',
      'REJECTED',
      'SUBMITTED',
    ]);
  });

  it('marks re-reviews of previously live listings', async () => {
    const { listing } = await pendingListing();
    await prisma.listing.update({ where: { id: listing.id }, data: { publishedAt: new Date() } });
    const queue = (await admin.get('/admin/listings/review-queue')).body.listings;
    expect(queue[0].wasPublished).toBe(true);
  });
});
