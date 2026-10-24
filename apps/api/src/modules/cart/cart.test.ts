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

/** A Tanzanian seller (cross-border kitenge, 2 phones) and a Zambian seller, plus a Zambian buyer. */
async function setup() {
  const { user: tzSeller } = await createSeller('TZ', { name: 'Amina Juma' });
  const { user: zmSeller } = await createSeller('ZM', { name: 'Mwila Banda' });
  const kitenge = await createListing(tzSeller, {
    title: 'Kitenge fabric',
    price: '25000',
    quantity: 10,
    crossBorder: true,
  });
  const radio = await createListing(tzSeller, {
    title: 'Solar radio',
    price: '42000',
    quantity: 2,
    crossBorder: true,
  });
  const tzOnly = await createListing(tzSeller, { title: 'Gas cooker', quantity: 1 });
  const sofa = await createListing(zmSeller, { title: 'Sofa', price: '3500', quantity: 1 });
  const buyer = await createUser({ countryCode: 'ZM', name: 'Natasha Phiri' });
  return {
    tzSeller,
    zmSeller,
    kitenge,
    radio,
    tzOnly,
    sofa,
    buyer,
    client: await signIn(buyer.email),
  };
}

beforeEach(async () => {
  await resetDb();
  await seedReferenceData(prisma); // rate 1 ZMW = 105 TZS
});

describe('cart', () => {
  it('is for signed-in users', async () => {
    expect((await request(app).get('/api/v1/cart')).status).toBe(401);
  });

  it('groups items by seller with totals in the buyer’s currency, and counts them', async () => {
    const { client, kitenge, radio, sofa, tzSeller, zmSeller } = await setup();
    await client.post('/cart/items', { listingId: kitenge.id, quantity: 2 });
    await client.post('/cart/items', { listingId: radio.id });
    const res = await client.post('/cart/items', { listingId: sofa.id });
    expect(res.status).toBe(201);

    const cart = res.body;
    expect(cart.buyerCurrency).toBe('ZMW');
    expect(cart.count).toBe(4);
    expect(cart.groups.map((g: { seller: { id: number } }) => g.seller.id)).toEqual([
      tzSeller.id,
      zmSeller.id,
    ]);
    const [tz, zm] = cart.groups;
    expect(tz).toMatchObject({ currency: 'TZS', subtotal: 92000, buyerSubtotal: 876.19 });
    expect(tz.deliveryMethods).toEqual(['PICKUP', 'CROSS_BORDER']);
    expect(zm).toMatchObject({ currency: 'ZMW', subtotal: 3500, buyerSubtotal: 3500 });
    expect(zm.deliveryMethods).toEqual(['PICKUP', 'LOCAL']);
    expect(cart.total).toBe(4376.19);

    expect((await client.get('/me/counts')).body.cart).toBe(4);
    const stat = await prisma.listingDailyStat.findFirstOrThrow({
      where: { listingId: kitenge.id },
    });
    expect(stat.cartAdds).toBe(1);
  });

  it('adds up repeated adds, but not beyond the stock', async () => {
    const { client, radio } = await setup();
    await client.post('/cart/items', { listingId: radio.id });
    await client.post('/cart/items', { listingId: radio.id });
    expect((await client.get('/cart')).body.groups[0].items[0].quantity).toBe(2);
    const more = await client.post('/cart/items', { listingId: radio.id });
    expect(more.status).toBe(409);
    expect(more.body.error.message).toBe('You already have all 2 available in your cart.');
  });

  it('refuses your own listing and items not sold in your country', async () => {
    const { client, tzOnly, tzSeller, kitenge } = await setup();
    expect((await client.post('/cart/items', { listingId: tzOnly.id })).body.error.code).toBe(
      'NOT_AVAILABLE_IN_COUNTRY',
    );
    const seller = await signIn(tzSeller.email);
    expect((await seller.post('/cart/items', { listingId: kitenge.id })).status).toBe(400);
  });

  it('changes quantities and removes items', async () => {
    const { client, kitenge, sofa } = await setup();
    await client.post('/cart/items', { listingId: kitenge.id });
    await client.post('/cart/items', { listingId: sofa.id });
    const changed = await client.patch(`/cart/items/${kitenge.id}`, { quantity: 5 });
    expect(changed.body.groups[0].items[0]).toMatchObject({ quantity: 5, lineTotal: 125000 });
    expect((await client.patch(`/cart/items/${kitenge.id}`, { quantity: 11 })).status).toBe(409);
    expect((await client.patch(`/cart/items/${kitenge.id}`, { quantity: 0 })).status).toBe(400);
    const removed = await client.delete(`/cart/items/${kitenge.id}`);
    expect(removed.body.groups).toHaveLength(1);
    expect(removed.body.count).toBe(1);
  });

  it('flags items that sold out or were removed after being added', async () => {
    const { client, kitenge, radio } = await setup();
    await client.post('/cart/items', { listingId: kitenge.id, quantity: 3 });
    await client.post('/cart/items', { listingId: radio.id });
    await prisma.listing.update({ where: { id: kitenge.id }, data: { quantity: 2 } });
    await prisma.listing.update({ where: { id: radio.id }, data: { status: 'REMOVED' } });
    const { groups, total } = (await client.get('/cart')).body;
    expect(groups[0].items.map((i: { problem: string }) => i.problem)).toEqual([
      'NOT_ENOUGH_STOCK',
      'UNAVAILABLE',
    ]);
    expect(groups[0].subtotal).toBe(0);
    expect(total).toBe(0);
  });
});

describe('checkout', () => {
  it('places one order per seller, with several items, then empties those lines', async () => {
    const { client, kitenge, radio, sofa, tzSeller, zmSeller } = await setup();
    await client.post('/cart/items', { listingId: kitenge.id, quantity: 2 });
    await client.post('/cart/items', { listingId: radio.id });
    await client.post('/cart/items', { listingId: sofa.id });

    const res = await client.post('/cart/checkout', {
      orders: [
        { sellerId: tzSeller.id, deliveryMethod: 'CROSS_BORDER', buyerNote: 'Bus to Lusaka' },
        { sellerId: zmSeller.id, deliveryMethod: 'LOCAL' },
      ],
    });
    expect(res.status).toBe(201);
    const [tzOrderId, zmOrderId] = res.body.orderIds;

    const tzOrder = (await client.get(`/orders/${tzOrderId}`)).body.order;
    expect(tzOrder).toMatchObject({
      currency: 'TZS',
      total: 92000,
      buyerCurrency: 'ZMW',
      buyerTotal: 876.19,
      quantity: 3,
      itemCount: 2,
      title: 'Kitenge fabric',
      deliveryMethod: 'CROSS_BORDER',
      buyerNote: 'Bus to Lusaka',
    });
    expect(
      tzOrder.items.map((i: { title: string; quantity: number }) => [i.title, i.quantity]),
    ).toEqual([
      ['Kitenge fabric', 2],
      ['Solar radio', 1],
    ]);
    expect((await client.get(`/orders/${zmOrderId}`)).body.order).toMatchObject({
      total: 3500,
      deliveryMethod: 'LOCAL',
    });

    expect((await prisma.listing.findUniqueOrThrow({ where: { id: kitenge.id } })).quantity).toBe(
      8,
    );
    expect((await prisma.listing.findUniqueOrThrow({ where: { id: sofa.id } })).status).toBe(
      'SOLD',
    );
    expect((await client.get('/cart')).body.groups).toHaveLength(0);

    const note = await prisma.notification.findFirstOrThrow({
      where: { userId: tzSeller.id, type: 'order.placed' },
    });
    expect(note.body).toContain('“Kitenge fabric” and 1 other item');
  });

  it('can order from one seller and keep the rest in the cart', async () => {
    const { client, kitenge, sofa, zmSeller } = await setup();
    await client.post('/cart/items', { listingId: kitenge.id });
    await client.post('/cart/items', { listingId: sofa.id });
    const res = await client.post('/cart/checkout', {
      orders: [{ sellerId: zmSeller.id, deliveryMethod: 'PICKUP' }],
    });
    expect(res.body.orderIds).toHaveLength(1);
    const cart = (await client.get('/cart')).body;
    expect(cart.groups.map((g: { items: { title: string }[] }) => g.items[0]!.title)).toEqual([
      'Kitenge fabric',
    ]);
  });

  it('is all or nothing: if one item sold out meanwhile, no order is placed', async () => {
    const { client, kitenge, sofa, tzSeller, zmSeller } = await setup();
    await client.post('/cart/items', { listingId: kitenge.id, quantity: 2 });
    await client.post('/cart/items', { listingId: sofa.id });
    // Someone else buys the sofa first.
    await prisma.listing.update({ where: { id: sofa.id }, data: { quantity: 0, status: 'SOLD' } });

    const res = await client.post('/cart/checkout', {
      orders: [
        { sellerId: tzSeller.id, deliveryMethod: 'CROSS_BORDER' },
        { sellerId: zmSeller.id, deliveryMethod: 'PICKUP' },
      ],
    });
    expect(res.status).toBe(409);
    expect(res.body.error.message).toContain('“Sofa”');
    expect(await prisma.order.count()).toBe(0);
    expect((await prisma.listing.findUniqueOrThrow({ where: { id: kitenge.id } })).quantity).toBe(
      10,
    );
    expect((await client.get('/cart')).body.count).toBe(3);
  });

  it('rolls back the whole order when two buyers race for the last items', async () => {
    const { client, kitenge, radio, tzSeller } = await setup();
    const other = await signIn((await createUser({ countryCode: 'ZM' })).email);
    for (const c of [client, other]) {
      await c.post('/cart/items', { listingId: kitenge.id });
      await c.post('/cart/items', { listingId: radio.id, quantity: 2 });
    }
    const body = { orders: [{ sellerId: tzSeller.id, deliveryMethod: 'PICKUP' }] };
    const results = await Promise.all([
      client.post('/cart/checkout', body),
      other.post('/cart/checkout', body),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(await prisma.order.count()).toBe(1);
    // The loser's kitenge was not taken: only the winner's one is gone.
    expect((await prisma.listing.findUniqueOrThrow({ where: { id: kitenge.id } })).quantity).toBe(
      9,
    );
    expect((await prisma.listing.findUniqueOrThrow({ where: { id: radio.id } })).status).toBe(
      'SOLD',
    );
  });

  it('checks the delivery option, the cart contents and a confirmed email', async () => {
    const { client, kitenge, tzSeller, zmSeller, buyer } = await setup();
    await client.post('/cart/items', { listingId: kitenge.id });
    const local = await client.post('/cart/checkout', {
      orders: [{ sellerId: tzSeller.id, deliveryMethod: 'LOCAL' }],
    });
    expect(local.status).toBe(400);
    expect(local.body.error.details.fields.deliveryMethod).toBeTruthy();
    expect(
      (
        await client.post('/cart/checkout', {
          orders: [{ sellerId: zmSeller.id, deliveryMethod: 'PICKUP' }],
        })
      ).status,
    ).toBe(409);
    expect((await client.post('/cart/checkout', { orders: [] })).status).toBe(400);

    await prisma.user.update({ where: { id: buyer.id }, data: { emailVerifiedAt: null } });
    const unverified = await client.post('/cart/checkout', {
      orders: [{ sellerId: tzSeller.id, deliveryMethod: 'PICKUP' }],
    });
    expect(unverified.body.error.code).toBe('EMAIL_NOT_VERIFIED');
  });
});
