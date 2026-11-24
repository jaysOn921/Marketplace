import { beforeEach, describe, expect, it, vi } from 'vitest';
import { seedReferenceData } from '../../../prisma/seed.js';
import { createApp } from '../../app.js';
import { prisma } from '../../db.js';
import { testClient } from '../../test/client.js';
import { resetDb } from '../../test/db.js';
import { createListing, createSeller, createUser, TEST_PASSWORD } from '../../test/factories.js';
import { testPushOutbox } from './push.service.js';

const app = createApp();
const phone = (n: number) => ({
  endpoint: `https://push.example.com/send/phone-${n}`,
  keys: { p256dh: `key-${n}`, auth: `auth-${n}` },
});

async function signIn(email: string) {
  const client = await testClient(app);
  await client.post('/auth/login', { email, password: TEST_PASSWORD });
  return client;
}

beforeEach(async () => {
  await resetDb();
  await seedReferenceData(prisma);
  testPushOutbox.length = 0;
});

describe('phone notifications', () => {
  it('says when the server has no keys, and only signed-in people can subscribe', async () => {
    const guest = await testClient(app);
    expect((await guest.get('/push/key')).body).toEqual({ publicKey: null });
    expect((await guest.post('/me/push', phone(1))).status).toBe(401);
    const client = await signIn((await createUser()).email);
    expect(
      (await client.post('/me/push', { endpoint: 'http://insecure.example.com' })).status,
    ).toBe(400);
  });

  it('sends notifications to each subscribed phone, in the person’s language', async () => {
    const { user: seller } = await createSeller('TZ', { locale: 'sw' });
    const listing = await createListing(seller, { title: 'Kitenge fabric' });
    const sellerClient = await signIn(seller.email);
    expect((await sellerClient.post('/me/push', phone(1))).status).toBe(204);
    await sellerClient.post('/me/push', phone(2));
    await sellerClient.post('/me/push', phone(2)); // the same phone twice is kept once
    expect((await sellerClient.get('/me/push')).body).toEqual({ devices: 2 });

    const buyer = await signIn((await createUser()).email);
    const order = await buyer.post('/orders', {
      listingId: listing.id,
      quantity: 1,
      deliveryMethod: 'PICKUP',
    });
    await vi.waitFor(() => expect(testPushOutbox).toHaveLength(2));
    expect(testPushOutbox.map((p) => p.endpoint).sort()).toEqual([
      phone(1).endpoint,
      phone(2).endpoint,
    ]);
    expect(testPushOutbox[0]!.message).toMatchObject({
      title: 'Oda mpya',
      link: `/orders/${order.body.order.id}`,
      tag: `/orders/${order.body.order.id}`,
      lang: 'sw',
    });
  });

  it('stops for a phone that turned it off, or all phones, and on account deletion', async () => {
    const user = await createUser();
    const client = await signIn(user.email);
    await client.post('/me/push', phone(1));
    await client.post('/me/push', phone(2));
    await client.delete('/me/push', { endpoint: phone(1).endpoint });
    expect((await client.get('/me/push')).body.devices).toBe(1);
    await client.delete('/me/push/all');
    expect((await client.get('/me/push')).body.devices).toBe(0);

    await client.post('/me/push', phone(3));
    await client.delete('/me', { password: TEST_PASSWORD });
    expect(await prisma.pushSubscription.count()).toBe(0);
  });

  it('moves a phone to whoever signed in on it last', async () => {
    const a = await signIn((await createUser()).email);
    const bUser = await createUser();
    const b = await signIn(bUser.email);
    await a.post('/me/push', phone(1));
    await b.post('/me/push', phone(1));
    const rows = await prisma.pushSubscription.findMany();
    expect(rows.map((r) => r.userId)).toEqual([bUser.id]);
  });
});
