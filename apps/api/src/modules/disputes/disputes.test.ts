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

const app = createApp();

async function signIn(email: string) {
  const client = await testClient(app);
  expect((await client.post('/auth/login', { email, password: TEST_PASSWORD })).status).toBe(200);
  return client;
}

async function setup() {
  const { user: seller } = await createSeller('TZ', { name: 'Amina Juma' });
  const listing = await createListing(seller, { title: 'Kitenge fabric', quantity: 5 });
  const buyerUser = await createUser({ countryCode: 'TZ', name: 'Baraka Said' });
  const buyer = await signIn(buyerUser.email);
  const sellerClient = await signIn(seller.email);
  const adminUser = await createUser({ role: 'ADMIN' });
  const admin = await signIn(adminUser.email);
  const orderId = (
    await buyer.post('/orders', { listingId: listing.id, quantity: 1, deliveryMethod: 'PICKUP' })
  ).body.order.id as number;
  await sellerClient.post(`/orders/${orderId}/accept`);
  return { seller, buyerUser, buyer, sellerClient, admin, adminUser, orderId };
}

beforeEach(async () => {
  await resetDb();
  await seedReferenceData(prisma);
});

describe('problems with orders', () => {
  it('lets the buyer report a problem, once at a time, telling the seller and admins', async () => {
    const { buyer, seller, adminUser, orderId, sellerClient } = await setup();
    expect((await buyer.get(`/orders/${orderId}`)).body.order).toMatchObject({
      dispute: null,
      canDispute: true,
    });
    expect(
      (await buyer.post(`/orders/${orderId}/dispute`, { reason: 'NOT_RECEIVED' })).status,
    ).toBe(400);
    const opened = await buyer.post(`/orders/${orderId}/dispute`, {
      reason: 'NOT_RECEIVED',
      details: 'I paid on Monday but the seller has not sent anything yet.',
    });
    expect(opened.status).toBe(201);
    expect(opened.body.dispute).toMatchObject({
      status: 'OPEN',
      reason: 'NOT_RECEIVED',
      openedBy: 'buyer',
      messages: [{ author: 'buyer', authorName: 'Baraka' }],
    });

    const again = await sellerClient.post(`/orders/${orderId}/dispute`, {
      reason: 'OTHER',
      details: 'Opening a second one at the same time.',
    });
    expect(again.status).toBe(409);
    const order = (await sellerClient.get(`/orders/${orderId}`)).body.order;
    expect(order).toMatchObject({ dispute: { status: 'OPEN' }, canDispute: false });
    expect(order.events.map((e: { type: string }) => e.type)).toContain('dispute_opened');

    expect(
      await prisma.notification.findFirst({ where: { userId: seller.id, type: 'dispute.opened' } }),
    ).not.toBeNull();
    expect(
      await prisma.notification.findFirst({ where: { userId: adminUser.id, type: 'dispute.new' } }),
    ).not.toBeNull();
    expect((await buyer.get('/me/counts')).body.openDisputes).toBe(0);
  });

  it('keeps strangers out, and shares one conversation between the buyer, seller and TZed', async () => {
    const { buyer, sellerClient, admin, orderId, buyerUser, seller } = await setup();
    const id = (
      await buyer.post(`/orders/${orderId}/dispute`, {
        reason: 'NOT_AS_DESCRIBED',
        details: 'The colours are different from the photos.',
      })
    ).body.dispute.id;

    const stranger = await signIn((await createUser()).email);
    expect((await stranger.get(`/orders/${orderId}/dispute`)).status).toBe(404);
    expect((await stranger.post(`/disputes/${id}/messages`, { body: 'Hi' })).status).toBe(404);
    expect(
      (
        await stranger.post(`/orders/${orderId}/dispute`, {
          reason: 'OTHER',
          details: 'Not my order at all.',
        })
      ).status,
    ).toBe(404);

    await sellerClient.post(`/disputes/${id}/messages`, {
      body: 'The photos are of the same print.',
    });
    const reply = await admin.post(`/disputes/${id}/messages`, {
      body: 'Could you both send a photo of the fabric?',
    });
    expect(reply.body.dispute.messages.map((m: { author: string }) => m.author)).toEqual([
      'buyer',
      'seller',
      'tzed',
    ]);
    expect(reply.body.dispute.messages[2].authorName).toBe('TZed support');
    expect((await buyer.get(`/orders/${orderId}/dispute`)).body.dispute.messages).toHaveLength(3);

    const buyerNotes = await prisma.notification.findMany({
      where: { userId: buyerUser.id, type: 'dispute.message' },
    });
    expect(buyerNotes.map((n) => n.title)).toEqual([
      `New reply about the problem on order #${orderId}`,
      `TZed support replied about order #${orderId}`,
    ]);
    // The seller isn't notified about their own message.
    expect(
      await prisma.notification.count({ where: { userId: seller.id, type: 'dispute.message' } }),
    ).toBe(1);
  });

  it('lets admins list and resolve problems, telling both sides the outcome', async () => {
    const { buyer, sellerClient, admin, adminUser, orderId, seller } = await setup();
    const id = (
      await buyer.post(`/orders/${orderId}/dispute`, {
        reason: 'DAMAGED',
        details: 'The radio arrived with a cracked case.',
      })
    ).body.dispute.id;
    expect((await buyer.get('/admin/disputes')).status).toBe(403);
    const list = (await admin.get('/admin/disputes')).body;
    expect(list.rows).toEqual([
      expect.objectContaining({
        id,
        orderId,
        status: 'OPEN',
        reason: 'DAMAGED',
        openedBy: 'buyer',
        buyerName: 'Baraka Said',
        orderTitle: 'Kitenge fabric',
        messages: 1,
      }),
    ]);
    expect((await admin.get('/me/counts')).body.openDisputes).toBe(1);

    expect((await admin.post(`/admin/disputes/${id}/resolve`, { resolution: 'ok' })).status).toBe(
      400,
    );
    const resolved = await admin.post(`/admin/disputes/${id}/resolve`, {
      resolution: 'The seller agreed to replace the radio at no cost.',
    });
    expect(resolved.body.dispute).toMatchObject({
      status: 'RESOLVED',
      resolution: 'The seller agreed to replace the radio at no cost.',
    });
    expect(
      (await admin.post(`/admin/disputes/${id}/resolve`, { resolution: 'Resolving it twice.' }))
        .status,
    ).toBe(409);
    expect(
      (await sellerClient.post(`/disputes/${id}/messages`, { body: 'One more thing' })).status,
    ).toBe(409);
    expect(
      await prisma.notification.findFirst({
        where: { userId: seller.id, type: 'dispute.resolved' },
      }),
    ).not.toBeNull();
    expect((await admin.get('/admin/disputes')).body.rows).toHaveLength(0);
    expect((await admin.get('/admin/disputes?status=RESOLVED')).body.rows).toHaveLength(1);
    expect(await auditActions(adminUser.id)).toContain('dispute.resolve');
    // A new problem can be raised after the last one was resolved.
    expect((await buyer.get(`/orders/${orderId}`)).body.order.canDispute).toBe(true);
  });
});
