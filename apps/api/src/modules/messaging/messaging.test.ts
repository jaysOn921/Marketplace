import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { seedReferenceData } from '../../../prisma/seed.js';
import { createApp } from '../../app.js';
import { prisma } from '../../db.js';
import { testOutbox } from '../../lib/mailer.js';
import { testClient } from '../../test/client.js';
import { resetDb } from '../../test/db.js';
import { createListing, createSeller, createUser, TEST_PASSWORD } from '../../test/factories.js';

const app = createApp();

async function signIn(email: string) {
  const client = await testClient(app);
  expect((await client.post('/auth/login', { email, password: TEST_PASSWORD })).status).toBe(200);
  return client;
}

async function setup() {
  const { user: seller } = await createSeller('TZ');
  await prisma.sellerProfile.update({
    where: { userId: seller.id },
    data: { shopName: 'Amina Electronics' },
  });
  const listing = await createListing(seller, { crossBorder: true, title: 'Samsung Galaxy A15' });
  const buyer = await createUser({ countryCode: 'ZM', name: 'Natasha Phiri' });
  return {
    seller,
    buyer,
    listing,
    sellerClient: await signIn(seller.email),
    buyerClient: await signIn(buyer.email),
  };
}

beforeEach(async () => {
  await resetDb();
  await seedReferenceData(prisma);
  testOutbox.length = 0;
});

describe('conversations', () => {
  it('lets a buyer message a seller about a listing, and the seller reply', async () => {
    const { seller, listing, buyerClient, sellerClient } = await setup();
    const start = await buyerClient.post('/conversations', {
      listingId: listing.id,
      body: 'Is it still available? Can you send to Lusaka?',
    });
    expect(start.status).toBe(201);
    expect(start.body.conversation).toMatchObject({
      role: 'buyer',
      otherParty: 'Amina Electronics',
      listing: { id: listing.id, title: 'Samsung Galaxy A15', currency: 'TZS' },
      canReply: true,
      orderId: null,
    });
    expect(start.body.messages).toEqual([
      expect.objectContaining({
        body: 'Is it still available? Can you send to Lusaka?',
        mine: true,
      }),
    ]);
    const id = start.body.conversation.id;

    // Seller sees it as unread, with a notification and an email.
    const inbox = await sellerClient.get('/conversations');
    expect(inbox.body).toMatchObject({
      unread: 1,
      conversations: [{ id, role: 'seller', otherParty: 'Natasha Phiri', unread: 1 }],
    });
    expect((await sellerClient.get('/me/counts')).body.messages).toBe(1);
    expect(
      await prisma.notification.findFirst({ where: { userId: seller.id, type: 'message.new' } }),
    ).not.toBeNull();
    expect(testOutbox.at(-1)).toMatchObject({
      to: seller.email,
      subject: expect.stringContaining('New message from Natasha Phiri'),
    });
    expect(testOutbox.at(-1)?.html).toContain('Reply');

    // Opening it marks it read; replying reaches the buyer.
    const opened = await sellerClient.get(`/conversations/${id}`);
    expect(opened.body.messages[0]).toMatchObject({ mine: false });
    expect((await sellerClient.get('/conversations')).body.unread).toBe(0);
    const reply = await sellerClient.post(`/conversations/${id}/messages`, {
      body: 'Yes! Bus via Tunduma, 4 days.',
    });
    expect(reply.body.messages.map((m: { mine: boolean }) => m.mine)).toEqual([false, true]);
    expect((await buyerClient.get('/conversations')).body.conversations[0]).toMatchObject({
      unread: 1,
      lastMessage: { body: 'Yes! Bus via Tunduma, 4 days.', mine: false },
    });
  });

  it('reuses one conversation per buyer and listing', async () => {
    const { listing, buyerClient } = await setup();
    const a = await buyerClient.post('/conversations', { listingId: listing.id, body: 'Hello' });
    const b = await buyerClient.post('/conversations', {
      listingId: listing.id,
      body: 'Hello again',
    });
    expect(b.body.conversation.id).toBe(a.body.conversation.id);
    expect(b.body.messages).toHaveLength(2);
    expect(await prisma.conversation.count()).toBe(1);
  });

  it('emails only for the first unread message, not every message in a burst', async () => {
    const { listing, buyerClient } = await setup();
    const id = (await buyerClient.post('/conversations', { listingId: listing.id, body: 'One' }))
      .body.conversation.id;
    await buyerClient.post(`/conversations/${id}/messages`, { body: 'Two' });
    await buyerClient.post(`/conversations/${id}/messages`, { body: 'Three' });
    expect(testOutbox.filter((m) => m.subject.includes('New message'))).toHaveLength(1);
    expect(await prisma.notification.count({ where: { type: 'message.new' } })).toBe(3);
  });

  it('keeps conversations private and validates messages', async () => {
    const { listing, buyerClient } = await setup();
    const id = (await buyerClient.post('/conversations', { listingId: listing.id, body: 'Hi' }))
      .body.conversation.id;
    const stranger = await signIn((await createUser()).email);
    expect((await stranger.get(`/conversations/${id}`)).status).toBe(404);
    expect((await stranger.post(`/conversations/${id}/messages`, { body: 'x' })).status).toBe(404);
    expect((await buyerClient.post(`/conversations/${id}/messages`, { body: '   ' })).status).toBe(
      400,
    );
    expect(
      (await buyerClient.post(`/conversations/${id}/messages`, { body: 'x'.repeat(2001) })).status,
    ).toBe(400);
    expect((await request(app).get('/api/v1/conversations')).status).toBe(401);
  });

  it('needs a confirmed email and an available listing', async () => {
    const { listing } = await setup();
    const unverified = await signIn((await createUser({ emailVerifiedAt: null })).email);
    expect(
      (await unverified.post('/conversations', { listingId: listing.id, body: 'Hi' })).body.error
        .code,
    ).toBe('EMAIL_NOT_VERIFIED');
    await prisma.listing.update({ where: { id: listing.id }, data: { status: 'PENDING_REVIEW' } });
    const buyer = await signIn((await createUser()).email);
    expect((await buyer.post('/conversations', { listingId: listing.id, body: 'Hi' })).status).toBe(
      404,
    );
  });

  it('lets a seller write first only to buyers who ordered the listing', async () => {
    const { buyer, listing, sellerClient, buyerClient } = await setup();
    expect(
      (
        await sellerClient.post('/conversations', {
          listingId: listing.id,
          buyerId: buyer.id,
          body: 'Hi',
        })
      ).status,
    ).toBe(403);
    const order = await buyerClient.post('/orders', {
      listingId: listing.id,
      quantity: 1,
      deliveryMethod: 'CROSS_BORDER',
    });
    const res = await sellerClient.post('/conversations', {
      listingId: listing.id,
      buyerId: buyer.id,
      body: 'Thanks for your order!',
    });
    expect(res.status).toBe(201);
    expect(res.body.conversation.orderId).toBe(order.body.order.id);
    // The order page links to the conversation.
    expect(
      (await buyerClient.get(`/orders/${order.body.order.id}`)).body.order.conversationId,
    ).toBe(res.body.conversation.id);
  });

  it('stops replies to suspended users', async () => {
    const { seller, listing, buyerClient } = await setup();
    const id = (await buyerClient.post('/conversations', { listingId: listing.id, body: 'Hi' }))
      .body.conversation.id;
    await prisma.user.update({ where: { id: seller.id }, data: { status: 'SUSPENDED' } });
    expect((await buyerClient.get(`/conversations/${id}`)).body.conversation.canReply).toBe(false);
    expect(
      (await buyerClient.post(`/conversations/${id}/messages`, { body: 'Hello?' })).status,
    ).toBe(409);
  });

  it('pages back through older messages', async () => {
    const { listing, buyerClient } = await setup();
    const id = (await buyerClient.post('/conversations', { listingId: listing.id, body: 'm0' }))
      .body.conversation.id;
    const conv = await prisma.conversation.findUniqueOrThrow({ where: { id } });
    await prisma.message.createMany({
      data: Array.from({ length: 60 }, (_, i) => ({
        conversationId: id,
        senderId: conv.buyerId,
        body: `m${i + 1}`,
      })),
    });
    const latest = await buyerClient.get(`/conversations/${id}`);
    expect(latest.body).toMatchObject({ hasMore: true });
    expect(latest.body.messages).toHaveLength(50);
    expect(latest.body.messages.at(-1).body).toBe('m60');
    const older = await buyerClient.get(
      `/conversations/${id}?before=${latest.body.messages[0].id}`,
    );
    expect(older.body.messages.map((m: { body: string }) => m.body)).toEqual(
      Array.from({ length: 11 }, (_, i) => `m${i}`),
    );
    expect(older.body.hasMore).toBe(false);
  });

  it('rate-limits message bursts', async () => {
    const limited = createApp({ rateLimit: true });
    const { listing } = await setup();
    const buyer = await createUser();
    const client = await testClient(limited);
    await client.post('/auth/login', { email: buyer.email, password: TEST_PASSWORD });
    const id = (await client.post('/conversations', { listingId: listing.id, body: 'Hi' })).body
      .conversation.id;
    for (let i = 0; i < 29; i++)
      await client.post(`/conversations/${id}/messages`, { body: `m${i}` });
    expect((await client.post(`/conversations/${id}/messages`, { body: 'too many' })).status).toBe(
      429,
    );
  });
});

describe('notifications', () => {
  it('lists notifications, marks one or all as read, and counts badges', async () => {
    const { seller, listing, buyerClient, sellerClient } = await setup();
    await buyerClient.post('/conversations', { listingId: listing.id, body: 'Hi' });
    await buyerClient.post('/orders', {
      listingId: listing.id,
      quantity: 1,
      deliveryMethod: 'CROSS_BORDER',
    });

    const list = await sellerClient.get('/notifications');
    expect(list.body.unread).toBe(2);
    expect(list.body.notifications.map((n: { type: string }) => n.type)).toEqual([
      'order.placed',
      'message.new',
    ]);
    expect((await sellerClient.get('/me/counts')).body).toEqual({
      notifications: 2,
      messages: 1,
      ordersToAct: 1,
      reviewQueue: 0,
    });

    await sellerClient.post(`/notifications/${list.body.notifications[0].id}/read`);
    expect((await sellerClient.get('/notifications')).body.unread).toBe(1);
    await sellerClient.post('/notifications/read-all');
    expect((await sellerClient.get('/notifications')).body.unread).toBe(0);

    // Can't mark someone else's notification.
    const n = await prisma.notification.create({
      data: { userId: seller.id, type: 'x', title: 'x' },
    });
    await buyerClient.post(`/notifications/${n.id}/read`);
    expect(
      (await prisma.notification.findUniqueOrThrow({ where: { id: n.id } })).readAt,
    ).toBeNull();
  });

  it('counts the review queue for admins only', async () => {
    const { listing } = await setup();
    await prisma.listing.update({ where: { id: listing.id }, data: { status: 'PENDING_REVIEW' } });
    const admin = await signIn((await createUser({ role: 'ADMIN' })).email);
    expect((await admin.get('/me/counts')).body.reviewQueue).toBe(1);
    const user = await signIn((await createUser()).email);
    expect((await user.get('/me/counts')).body.reviewQueue).toBe(0);
  });
});
