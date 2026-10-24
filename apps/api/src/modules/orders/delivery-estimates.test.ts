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

describe('delivery estimates', () => {
  it('lets a seller set, change and clear their usual delivery times', async () => {
    const { user: seller } = await createSeller('TZ');
    const client = await signIn(seller.email);
    const listing = await createListing(seller, { crossBorder: true });

    const set = await client.patch(`/listings/${listing.id}`, {
      localDays: '1-2',
      crossBorderDays: '4-7',
    });
    expect(set.status).toBe(200);
    expect(set.body.listing).toMatchObject({ localDays: '1-2', crossBorderDays: '4-7' });
    // Delivery details don't send a live listing back for review.
    expect(set.body.listing.status).toBe('ACTIVE');

    expect((await client.patch(`/listings/${listing.id}`, { crossBorderDays: '3-9' })).status).toBe(
      400,
    );
    const cleared = await client.patch(`/listings/${listing.id}`, { localDays: '' });
    expect(cleared.body.listing).toMatchObject({ localDays: null, crossBorderDays: '4-7' });
  });

  it('saves the estimate on the order and asks cross-border buyers to accept customs', async () => {
    const { user: seller } = await createSeller('TZ');
    const listing = await createListing(seller, {
      crossBorder: true,
      quantity: 5,
      crossBorderDaysMin: 4,
      crossBorderDaysMax: 7,
    });
    const buyer = await signIn((await createUser({ countryCode: 'ZM' })).email);
    const order = { listingId: listing.id, quantity: 1, deliveryMethod: 'CROSS_BORDER' };

    const refused = await buyer.post('/orders', order);
    expect(refused.status).toBe(400);
    expect(refused.body.error.details.fields.acceptCustoms).toMatch(/import duty/);
    expect(await prisma.order.count()).toBe(0);

    const placed = await buyer.post('/orders', { ...order, acceptCustoms: true });
    expect(placed.status).toBe(201);
    expect(placed.body.order.deliveryDays).toEqual({ min: 4, max: 7 });

    // Later changes to the listing don't change the order.
    await prisma.listing.update({
      where: { id: listing.id },
      data: { crossBorderDaysMin: 10, crossBorderDaysMax: 14 },
    });
    expect((await buyer.get(`/orders/${placed.body.order.id}`)).body.order.deliveryDays).toEqual({
      min: 4,
      max: 7,
    });

    // Collection has no delivery time, and needs no customs answer.
    const pickup = await buyer.post('/orders', { ...order, deliveryMethod: 'PICKUP' });
    expect(pickup.status).toBe(201);
    expect(pickup.body.order.deliveryDays).toBeNull();
  });

  it('shows the slowest item for a seller in the cart, and checks customs at checkout', async () => {
    const { user: seller } = await createSeller('TZ');
    const fast = await createListing(seller, {
      crossBorder: true,
      crossBorderDaysMin: 3,
      crossBorderDaysMax: 5,
    });
    const slow = await createListing(seller, {
      crossBorder: true,
      crossBorderDaysMin: 5,
      crossBorderDaysMax: 10,
    });
    const buyer = await signIn((await createUser({ countryCode: 'ZM' })).email);
    await buyer.post('/cart/items', { listingId: fast.id });
    const cart = (await buyer.post('/cart/items', { listingId: slow.id })).body;
    expect(cart.groups[0].deliveryDays).toEqual({ CROSS_BORDER: { min: 5, max: 10 } });

    const choice = { sellerId: seller.id, deliveryMethod: 'CROSS_BORDER' };
    const refused = await buyer.post('/cart/checkout', { orders: [choice] });
    expect(refused.status).toBe(400);
    expect(await prisma.order.count()).toBe(0);
    const placed = await buyer.post('/cart/checkout', {
      orders: [{ ...choice, acceptCustoms: true }],
    });
    expect(placed.status).toBe(201);
    expect((await buyer.get(`/orders/${placed.body.orderIds[0]}`)).body.order.deliveryDays).toEqual(
      { min: 5, max: 10 },
    );
  });
});
