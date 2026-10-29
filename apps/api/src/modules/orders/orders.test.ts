import { beforeEach, describe, expect, it } from 'vitest';
import { seedReferenceData } from '../../../prisma/seed.js';
import { createApp } from '../../app.js';
import { prisma } from '../../db.js';
import { testOutbox } from '../../lib/mailer.js';
import { testClient } from '../../test/client.js';
import { resetDb } from '../../test/db.js';
import {
  auditActions,
  createListing,
  createSeller,
  createUser,
  TEST_PASSWORD,
} from '../../test/factories.js';

const app = createApp();

async function signIn(email: string) {
  const client = await testClient(app);
  expect((await client.post('/auth/login', { email, password: TEST_PASSWORD })).status).toBe(200);
  return client;
}

/** A Tanzanian seller (phone visible after acceptance) with a cross-border listing, and a Zambian buyer. */
async function setup(listingOverrides: Parameters<typeof createListing>[1] = {}) {
  const { user: seller } = await createSeller('TZ', { phone: '+255712345678' });
  await prisma.sellerProfile.update({
    where: { userId: seller.id },
    data: { contactPreference: 'BOTH' },
  });
  const listing = await createListing(seller, { crossBorder: true, ...listingOverrides });
  const buyer = await createUser({
    countryCode: 'ZM',
    phone: '+260977123456',
    name: 'Natasha Phiri',
    sharePhoneOnOrders: true,
  });
  return {
    seller,
    buyer,
    listing,
    sellerClient: await signIn(seller.email),
    buyerClient: await signIn(buyer.email),
  };
}

const order = (listingId: number, overrides: Record<string, unknown> = {}) => ({
  listingId,
  quantity: 1,
  deliveryMethod: 'CROSS_BORDER',
  acceptCustoms: true,
  ...overrides,
});

beforeEach(async () => {
  await resetDb();
  await seedReferenceData(prisma); // rate: 1 ZMW = 105 TZS
  testOutbox.length = 0;
});

describe('placing an order', () => {
  it('holds the stock, saves prices in both currencies and notifies the seller', async () => {
    const { seller, listing, buyerClient } = await setup();
    const res = await buyerClient.post(
      '/orders',
      order(listing.id, { quantity: 2, buyerNote: 'Please send by Juldan bus' }),
    );
    expect(res.status).toBe(201);
    expect(res.body.order).toMatchObject({
      status: 'PLACED',
      paymentStatus: 'UNPAID',
      role: 'buyer',
      title: 'Samsung Galaxy A15',
      quantity: 2,
      currency: 'TZS',
      unitPrice: 380000,
      total: 760000,
      buyerCurrency: 'ZMW',
      buyerTotal: 7238.1, // 760,000 / 105
      deliveryMethod: 'CROSS_BORDER',
      buyerNote: 'Please send by Juldan bus',
      actions: ['cancel'],
    });
    expect(res.body.order.fxRate).toBeCloseTo(1 / 105, 8);
    expect(res.body.order.seller.phone).toBeNull(); // not until accepted
    expect(res.body.order.events).toEqual([
      expect.objectContaining({ type: 'placed', actor: 'buyer' }),
    ]);

    expect((await prisma.listing.findUniqueOrThrow({ where: { id: listing.id } })).quantity).toBe(
      1,
    );
    expect(
      await prisma.notification.findFirst({ where: { userId: seller.id, type: 'order.placed' } }),
    ).not.toBeNull();
    expect(testOutbox.at(-1)).toMatchObject({
      to: seller.email,
      subject: expect.stringContaining('New order'),
    });
  });

  it('keeps one currency for buyers in the same country', async () => {
    const { listing } = await setup();
    const tzBuyer = await createUser({ countryCode: 'TZ' });
    const res = await (
      await signIn(tzBuyer.email)
    ).post('/orders', order(listing.id, { deliveryMethod: 'LOCAL' }));
    expect(res.body.order).toMatchObject({
      currency: 'TZS',
      buyerCurrency: 'TZS',
      buyerTotal: 380000,
      fxRate: 1,
    });
  });

  it('refuses listings that are not available in the buyer’s country', async () => {
    const { listing, buyerClient } = await setup({ crossBorder: false });
    const res = await buyerClient.post('/orders', order(listing.id, { deliveryMethod: 'PICKUP' }));
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('NOT_AVAILABLE_IN_COUNTRY');
  });

  it('only allows delivery options the seller offers to that buyer', async () => {
    const { listing, buyerClient } = await setup({ deliveryPickup: false });
    // Local delivery is only for buyers in the seller's country.
    expect(
      (await buyerClient.post('/orders', order(listing.id, { deliveryMethod: 'LOCAL' }))).status,
    ).toBe(400);
    expect(
      (await buyerClient.post('/orders', order(listing.id, { deliveryMethod: 'PICKUP' }))).status,
    ).toBe(400);
    expect((await buyerClient.post('/orders', order(listing.id))).status).toBe(201);
    const tzBuyer = await signIn((await createUser({ countryCode: 'TZ' })).email);
    expect((await tzBuyer.post('/orders', order(listing.id))).status).toBe(400); // cross-border from the same country
  });

  it('needs a confirmed email, refuses your own listing and unavailable listings', async () => {
    const { listing, sellerClient } = await setup();
    expect(
      (await sellerClient.post('/orders', order(listing.id, { deliveryMethod: 'PICKUP' }))).status,
    ).toBe(400);

    const unverified = await signIn(
      (await createUser({ countryCode: 'ZM', emailVerifiedAt: null })).email,
    );
    expect((await unverified.post('/orders', order(listing.id))).body.error.code).toBe(
      'EMAIL_NOT_VERIFIED',
    );

    await prisma.listing.update({ where: { id: listing.id }, data: { status: 'PENDING_REVIEW' } });
    const buyer = await signIn((await createUser({ countryCode: 'ZM' })).email);
    expect((await buyer.post('/orders', order(listing.id))).status).toBe(409);
  });

  it('says how many are left, and marks the listing sold when the last one is ordered', async () => {
    const { listing, buyerClient } = await setup({ quantity: 2 });
    const tooMany = await buyerClient.post('/orders', order(listing.id, { quantity: 3 }));
    expect(tooMany.status).toBe(409);
    expect(tooMany.body.error.message).toBe(
      'Only 2 of “Samsung Galaxy A15” left. Please lower the quantity.',
    );

    expect((await buyerClient.post('/orders', order(listing.id, { quantity: 2 }))).status).toBe(
      201,
    );
    expect(await prisma.listing.findUniqueOrThrow({ where: { id: listing.id } })).toMatchObject({
      quantity: 0,
      status: 'SOLD',
    });
    expect((await buyerClient.post('/orders', order(listing.id))).body.error.message).toMatch(
      /no longer available/,
    );
  });

  it('never sells the last item twice when two buyers order at the same moment', async () => {
    const { listing, buyerClient } = await setup({ quantity: 1 });
    const other = await signIn((await createUser({ countryCode: 'ZM' })).email);
    const results = await Promise.all([
      buyerClient.post('/orders', order(listing.id)),
      other.post('/orders', order(listing.id)),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(await prisma.order.count()).toBe(1);
    expect((await prisma.listing.findUniqueOrThrow({ where: { id: listing.id } })).quantity).toBe(
      0,
    );
  });
});

describe('order steps', () => {
  async function placed(overrides: Parameters<typeof createListing>[1] = {}) {
    const ctx = await setup(overrides);
    const res = await ctx.buyerClient.post('/orders', order(ctx.listing.id));
    return { ...ctx, id: res.body.order.id as number };
  }

  it('goes from placed to accepted, ready, paid and completed', async () => {
    const { id, buyer, sellerClient, buyerClient } = await placed();
    expect((await buyerClient.post(`/orders/${id}/accept`)).status).toBe(403); // buyers can't accept

    const accepted = await sellerClient.post(`/orders/${id}/accept`);
    expect(accepted.body.order).toMatchObject({
      status: 'ACCEPTED',
      role: 'seller',
      actions: ['ready', 'complete', 'cancel', 'mark-paid'],
    });
    // Contact details are shared once accepted.
    expect(accepted.body.order.buyer.phone).toBe('+260977123456');
    expect((await buyerClient.get(`/orders/${id}`)).body.order.seller.phone).toBe('+255712345678');
    expect(
      await prisma.notification.findFirst({ where: { userId: buyer.id, type: 'order.accepted' } }),
    ).not.toBeNull();

    expect((await sellerClient.post(`/orders/${id}/ready`)).body.order.status).toBe('READY');

    // The buyer says they paid; it only counts as paid once the seller confirms.
    const reported = await buyerClient.post(`/orders/${id}/report-paid`);
    expect(reported.body.order).toMatchObject({ paymentStatus: 'UNPAID', actions: ['received'] });
    expect(reported.body.order.buyerPaidAt).not.toBeNull();
    expect((await buyerClient.post(`/orders/${id}/report-paid`)).status).toBe(409); // only once
    expect((await sellerClient.post(`/orders/${id}/mark-paid`)).body.order.paymentStatus).toBe(
      'PAID_OFFLINE',
    );

    // Only the seller completes; the buyer confirms receipt.
    expect((await buyerClient.post(`/orders/${id}/complete`)).status).toBe(403);
    const received = await buyerClient.post(`/orders/${id}/received`);
    expect(received.body.order).toMatchObject({ status: 'READY', actions: [] });
    expect(received.body.order.receivedAt).not.toBeNull();
    expect(
      await prisma.notification.findFirst({
        where: {
          userId: (await prisma.order.findUniqueOrThrow({ where: { id } })).sellerId,
          type: 'order.received',
        },
      }),
    ).not.toBeNull();

    const done = await sellerClient.post(`/orders/${id}/complete`);
    expect(done.body.order).toMatchObject({ status: 'COMPLETED', actions: [] });
    expect(done.body.order.completedAt).not.toBeNull();
    expect(
      done.body.order.events.map((e: { type: string; actor: string }) => `${e.type}:${e.actor}`),
    ).toEqual([
      'placed:buyer',
      'accepted:seller',
      'ready:seller',
      'buyer_paid:buyer',
      'paid:seller',
      'received:buyer',
      'completed:seller',
    ]);
  });

  it('blocks cancelling once the buyer has received the item', async () => {
    const { id, sellerClient, buyerClient } = await placed();
    await sellerClient.post(`/orders/${id}/accept`);
    // e.g. collected in person before the seller marked it ready
    expect((await buyerClient.post(`/orders/${id}/received`)).status).toBe(200);
    expect((await buyerClient.post(`/orders/${id}/cancel`)).status).toBe(409);
    expect((await sellerClient.post(`/orders/${id}/cancel`)).status).toBe(409);
    expect((await sellerClient.post(`/orders/${id}/complete`)).body.order.status).toBe('COMPLETED');
  });

  it('does not share a seller’s phone if they prefer messages only', async () => {
    const { id, seller, sellerClient, buyerClient } = await placed();
    await prisma.sellerProfile.update({
      where: { userId: seller.id },
      data: { contactPreference: 'MESSAGES' },
    });
    await sellerClient.post(`/orders/${id}/accept`);
    expect((await buyerClient.get(`/orders/${id}`)).body.order.seller.phone).toBeNull();
  });

  it('keeps a buyer’s phone private unless they chose to share it', async () => {
    const { id, buyer, sellerClient, buyerClient } = await placed();
    await buyerClient.put('/me/phone-sharing', { share: false });
    expect(
      (await prisma.user.findUniqueOrThrow({ where: { id: buyer.id } })).sharePhoneOnOrders,
    ).toBe(false);
    const accepted = await sellerClient.post(`/orders/${id}/accept`);
    expect(accepted.body.order.buyer).toMatchObject({ name: 'Natasha Phiri', phone: null });
    expect(accepted.body.order.buyer).not.toHaveProperty('email');

    // Turning it on later shares it on existing orders too.
    expect((await buyerClient.put('/me/phone-sharing', { share: true })).body.user).toMatchObject({
      sharePhoneOnOrders: true,
    });
    expect((await sellerClient.get(`/orders/${id}`)).body.order.buyer.phone).toBe('+260977123456');
    expect(await auditActions(buyer.id)).toEqual(
      expect.arrayContaining(['user.phone_sharing_off', 'user.phone_sharing_on']),
    );
  });

  it('declining needs a reason and puts the stock back (relisting a sold-out item)', async () => {
    const { id, listing, sellerClient } = await placed({ quantity: 1 });
    expect((await prisma.listing.findUniqueOrThrow({ where: { id: listing.id } })).status).toBe(
      'SOLD',
    );

    expect((await sellerClient.post(`/orders/${id}/decline`, {})).status).toBe(400);
    const res = await sellerClient.post(`/orders/${id}/decline`, {
      reason: 'Out of stock in this colour',
    });
    expect(res.body.order).toMatchObject({
      status: 'DECLINED',
      cancelReason: 'Out of stock in this colour',
    });
    expect(await prisma.listing.findUniqueOrThrow({ where: { id: listing.id } })).toMatchObject({
      quantity: 1,
      status: 'ACTIVE',
    });
  });

  it('lets the buyer cancel before it is ready, without relisting items the seller marked sold', async () => {
    const { id, listing, buyerClient } = await placed();
    await prisma.listing.update({ where: { id: listing.id }, data: { status: 'SOLD' } }); // marked sold by seller
    const res = await buyerClient.post(`/orders/${id}/cancel`, { reason: 'Found one nearer' });
    expect(res.body.order.status).toBe('CANCELLED');
    expect(await prisma.listing.findUniqueOrThrow({ where: { id: listing.id } })).toMatchObject({
      quantity: 3,
      status: 'SOLD',
    });
  });

  it('refuses the same step twice', async () => {
    const { id, sellerClient } = await placed();
    const [a, b] = await Promise.all([
      sellerClient.post(`/orders/${id}/accept`),
      sellerClient.post(`/orders/${id}/accept`),
    ]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
    expect(await prisma.orderEvent.count({ where: { orderId: id, type: 'accepted' } })).toBe(1);
  });

  it('keeps orders private to the buyer and seller', async () => {
    const { id } = await placed();
    const stranger = await signIn((await createUser()).email);
    expect((await stranger.get(`/orders/${id}`)).status).toBe(404);
    expect((await stranger.post(`/orders/${id}/cancel`)).status).toBe(404);
  });
});

describe('order lists', () => {
  it('lists buying and selling orders, with a count of orders waiting for the seller', async () => {
    const { listing, sellerClient, buyerClient } = await setup();
    await buyerClient.post('/orders', order(listing.id));
    await buyerClient.post('/orders', order(listing.id));

    const selling = await sellerClient.get('/orders?role=selling');
    expect(selling.body.needsAction).toBe(2);
    expect(selling.body.orders).toHaveLength(2);
    expect(selling.body.orders[0]).toMatchObject({ role: 'seller', otherParty: 'Natasha Phiri' });

    const buying = await buyerClient.get('/orders?role=buying');
    expect(buying.body.orders[0].otherParty).toMatch(/Shop$/);
    expect((await sellerClient.get('/orders?role=buying')).body.orders).toHaveLength(0);
    expect(
      (await sellerClient.get('/orders?role=selling&status=ACCEPTED')).body.orders,
    ).toHaveLength(0);
  });
});
