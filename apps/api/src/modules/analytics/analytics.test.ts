import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { seedReferenceData } from '../../../prisma/seed.js';
import { createApp } from '../../app.js';
import { prisma } from '../../db.js';
import { testClient } from '../../test/client.js';
import { resetDb } from '../../test/db.js';
import { createListing, createSeller, createUser, TEST_PASSWORD } from '../../test/factories.js';
import { resetSeenViews } from './listing-stats.js';

const app = createApp();
const DAY = 24 * 60 * 60 * 1000;
const today = () => new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00.000Z');

async function signIn(email: string) {
  const client = await testClient(app);
  expect((await client.post('/auth/login', { email, password: TEST_PASSWORD })).status).toBe(200);
  return client;
}

/** Places an order through the API, then (optionally) marks it completed now. */
async function order(
  buyer: Awaited<ReturnType<typeof signIn>>,
  listingId: number,
  quantity: number,
  deliveryMethod: string,
  complete = false,
) {
  const res = await buyer.post('/orders', { listingId, quantity, deliveryMethod });
  expect(res.status).toBe(201);
  if (complete)
    await prisma.order.update({
      where: { id: res.body.order.id },
      data: { status: 'COMPLETED', completedAt: new Date() },
    });
  return res.body.order.id as number;
}

beforeEach(async () => {
  await resetDb();
  await seedReferenceData(prisma); // rate 1 ZMW = 105 TZS
  resetSeenViews();
});

describe('listing views', () => {
  it('counts each visitor once a day, but not the seller, admins or bots', async () => {
    const { user: seller } = await createSeller('TZ');
    const listing = await createListing(seller);
    const views = async () =>
      (await prisma.listingDailyStat.findFirst({ where: { listingId: listing.id } }))?.views ?? 0;

    await request(app).get(`/api/v1/listings/${listing.id}`);
    await request(app).get(`/api/v1/listings/${listing.id}`); // same guest again
    expect(await views()).toBe(1);
    await request(app)
      .get(`/api/v1/listings/${listing.id}`)
      .set('User-Agent', 'Mozilla/5.0 (Linux; Android 14)');
    expect(await views()).toBe(2);
    await request(app).get(`/api/v1/listings/${listing.id}`).set('User-Agent', 'Googlebot/2.1');

    const buyer = await signIn((await createUser()).email);
    await buyer.get(`/listings/${listing.id}`);
    await (await signIn(seller.email)).get(`/listings/${listing.id}`);
    await (
      await signIn((await createUser({ role: 'ADMIN' })).email)
    ).get(`/listings/${listing.id}`);
    expect(await views()).toBe(3);
  });
});

describe('seller analytics', () => {
  it('shows a seller their own views, cart adds, orders and completed sales', async () => {
    const { user: seller } = await createSeller('TZ');
    const { user: other } = await createSeller('TZ');
    const phone = await createListing(seller, { title: 'Phone', price: '100000', quantity: 9 });
    const radio = await createListing(seller, { title: 'Radio', price: '40000', quantity: 9 });
    const notMine = await createListing(other, { title: 'Not mine' });
    await prisma.listingDailyStat.createMany({
      data: [
        { listingId: phone.id, day: today(), views: 12, cartAdds: 2 },
        { listingId: phone.id, day: new Date(today().getTime() - 10 * DAY), views: 4, cartAdds: 0 },
        { listingId: radio.id, day: today(), views: 3, cartAdds: 1 },
        { listingId: notMine.id, day: today(), views: 99, cartAdds: 9 },
      ],
    });
    const buyer = await signIn((await createUser({ countryCode: 'TZ' })).email);
    await order(buyer, phone.id, 2, 'PICKUP', true);
    await order(buyer, radio.id, 1, 'PICKUP');
    const declined = await order(buyer, radio.id, 3, 'PICKUP');
    await prisma.order.update({ where: { id: declined }, data: { status: 'DECLINED' } });

    const res = await (await signIn(seller.email)).get('/me/analytics?days=7');
    expect(res.status).toBe(200);
    const a = res.body;
    expect(a).toMatchObject({ days: 7, currency: 'TZS' });
    expect(a.kpis).toEqual({
      views: { value: 15, previous: 4 },
      cartAdds: { value: 3, previous: 0 },
      ordersPlaced: { value: 3, previous: 0 },
      unitsSold: { value: 3, previous: 0 },
      sales: { value: 200000, previous: 0 },
    });
    expect(a.daily.views).toHaveLength(7);
    expect(a.daily.views.at(-1)).toEqual({ day: today().toISOString().slice(0, 10), value: 15 });
    expect(a.listings).toEqual([
      expect.objectContaining({ title: 'Phone', views: 12, orders: 1, units: 2, sales: 200000 }),
      expect.objectContaining({ title: 'Radio', views: 3, cartAdds: 1, orders: 1, units: 1 }),
    ]);
  });
});

describe('admin analytics', () => {
  it('sums the marketplace across both countries, with sales in shillings', async () => {
    const { user: tzSeller } = await createSeller('TZ', { name: 'Amina' });
    const { user: zmSeller } = await createSeller('ZM', { name: 'Mwila' });
    const kitenge = await createListing(tzSeller, {
      price: '25000',
      quantity: 9,
      crossBorder: true,
    });
    const sofa = await createListing(zmSeller, { price: '3500', quantity: 9 });
    const zmBuyer = await signIn((await createUser({ countryCode: 'ZM' })).email);
    await order(zmBuyer, kitenge.id, 1, 'CROSS_BORDER', true);
    await order(zmBuyer, sofa.id, 1, 'LOCAL', true);
    await order(zmBuyer, sofa.id, 1, 'PICKUP');
    await prisma.listingDailyStat.create({
      data: { listingId: kitenge.id, day: today(), views: 40, cartAdds: 5 },
    });

    const user = await signIn((await createUser()).email);
    expect((await user.get('/admin/analytics')).status).toBe(403);
    const admin = await signIn((await createUser({ role: 'ADMIN' })).email);
    const a = (await admin.get('/admin/analytics?days=bogus')).body;

    expect(a.days).toBe(30);
    expect(a.rate).toBe(105);
    expect(a.kpis.ordersPlaced).toEqual({ value: 3, previous: 0 });
    expect(a.kpis.ordersCompleted.value).toBe(2);
    // TSh 25,000 + K 3,500 × 105
    expect(a.kpis.sales.value).toBe(392500);
    expect(a.kpis.views.value).toBe(40);
    expect(a.kpis.newUsers.value).toBe(4); // two sellers, the buyer, the user (not the admin)
    expect(a.daily.orders).toHaveLength(30);
    expect(a.daily.orders.at(-1).value).toBe(3);
    expect(a.crossBorderOrders).toBe(1);
    expect(a.countries).toEqual([
      expect.objectContaining({ code: 'ZM', ordersAsBuyer: 3, sales: 3500, currency: 'ZMW' }),
      expect.objectContaining({ code: 'TZ', ordersAsBuyer: 0, sales: 25000, currency: 'TZS' }),
    ]);
    expect(a.topSellers.map((s: { name: string; sales: number }) => [s.name, s.sales])).toEqual([
      ['Mwila Shop', 367500],
      ['Amina Shop', 25000],
    ]);
    expect(a.topCategories[0]).toMatchObject({ slug: 'electronics', units: 3, orders: 3 });
    expect(a.statuses).toEqual([
      { status: 'COMPLETED', count: 2 },
      { status: 'PLACED', count: 1 },
    ]);
  });
});
