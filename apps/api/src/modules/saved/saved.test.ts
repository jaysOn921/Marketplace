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

beforeEach(async () => {
  await resetDb();
  await seedReferenceData(prisma);
});

describe('saved items', () => {
  it('saves and unsaves listings, newest first, keeping sold ones with their status', async () => {
    const { user: seller } = await createSeller('TZ');
    const phone = await createListing(seller, { title: 'Phone' });
    const radio = await createListing(seller, { title: 'Radio' });
    const draft = await createListing(seller, {
      title: 'Draft',
      status: 'DRAFT',
      publishedAt: null,
    });
    expect((await request(app).get('/api/v1/me/saved')).status).toBe(401);

    const buyer = await signIn((await createUser()).email);
    expect((await buyer.put(`/me/saved/${phone.id}`)).status).toBe(204);
    await new Promise((r) => setTimeout(r, 5));
    expect((await buyer.put(`/me/saved/${radio.id}`)).status).toBe(204);
    expect((await buyer.put(`/me/saved/${radio.id}`)).status).toBe(204); // saving twice is fine
    expect((await buyer.put(`/me/saved/${draft.id}`)).status).toBe(404);
    expect((await buyer.put('/me/saved/999999')).status).toBe(404);

    await prisma.listing.update({ where: { id: phone.id }, data: { status: 'SOLD' } });
    const saved = (await buyer.get('/me/saved')).body;
    expect(saved.ids).toEqual([radio.id, phone.id]);
    expect(
      saved.listings.map((l: { title: string; status: string }) => [l.title, l.status]),
    ).toEqual([
      ['Radio', 'ACTIVE'],
      ['Phone', 'SOLD'],
    ]);

    expect((await buyer.delete(`/me/saved/${radio.id}`)).status).toBe(204);
    expect((await buyer.get('/me/saved')).body.ids).toEqual([phone.id]);
  });

  it('returns live listings by id in the order asked, for "Recently viewed"', async () => {
    const { user: seller } = await createSeller('TZ');
    const a = await createListing(seller, { title: 'A' });
    const b = await createListing(seller, { title: 'B' });
    const gone = await createListing(seller, { title: 'Gone', status: 'REMOVED' });
    const res = await request(app).get(`/api/v1/listings/by-ids?ids=${b.id},${gone.id},${a.id},x`);
    expect(res.status).toBe(200);
    expect(res.body.listings.map((l: { title: string }) => l.title)).toEqual(['B', 'A']);
    expect((await request(app).get('/api/v1/listings/by-ids')).body.listings).toEqual([]);
  });
});

describe('price drop on a saved item', () => {
  it('tells people who saved it when a lower price is approved, not before', async () => {
    const { user: seller } = await createSeller('TZ');
    const listing = await createListing(seller, { price: '50000', approvedPrice: '50000' });
    const saver = await createUser();
    const other = await createUser();
    await prisma.savedListing.create({ data: { userId: saver.id, listingId: listing.id } });
    const sellerClient = await signIn(seller.email);
    const admin = await signIn((await createUser({ role: 'ADMIN' })).email);
    const drops = () => prisma.notification.findMany({ where: { type: 'saved.price_drop' } });

    // A price change on a live listing goes back for review first.
    const edited = await sellerClient.patch(`/listings/${listing.id}`, { price: 42000 });
    expect(edited.body.listing.status).toBe('PENDING_REVIEW');
    expect(await drops()).toHaveLength(0);

    await admin.post(`/admin/listings/${listing.id}/approve`);
    const sent = await drops();
    expect(sent.map((n) => n.userId)).toEqual([saver.id]);
    expect(sent[0]!.body).toBe('“Samsung Galaxy A15” is now TSh 42,000 (was TSh 50,000).');
    expect(other.id).not.toBe(saver.id);

    // A price rise doesn't notify anyone.
    await sellerClient.patch(`/listings/${listing.id}`, { price: 45000 });
    await admin.post(`/admin/listings/${listing.id}/approve`);
    expect(await drops()).toHaveLength(1);
  });
});
