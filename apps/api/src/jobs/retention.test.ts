import { beforeEach, describe, expect, it } from 'vitest';
import { seedReferenceData } from '../../prisma/seed.js';
import { createApp } from '../app.js';
import { prisma } from '../db.js';
import { testOutbox } from '../lib/mailer.js';
import { testClient } from '../test/client.js';
import { resetDb } from '../test/db.js';
import { createListing, createSeller, createUser, TEST_PASSWORD } from '../test/factories.js';
import { runRetention } from './retention.js';

const DAY = 24 * 60 * 60 * 1000;
const ago = (days: number) => new Date(Date.now() - days * DAY);

beforeEach(async () => {
  await resetDb();
  await seedReferenceData(prisma);
  testOutbox.length = 0;
});

describe('retention job', () => {
  it('removes old tokens, notifications, stats and audit IPs, keeping recent ones', async () => {
    const { user: seller } = await createSeller('TZ');
    const listing = await createListing(seller);
    await prisma.authToken.createMany({
      data: [
        { userId: seller.id, type: 'EMAIL_VERIFY', tokenHash: 'a'.repeat(64), expiresAt: ago(10) },
        { userId: seller.id, type: 'EMAIL_VERIFY', tokenHash: 'b'.repeat(64), expiresAt: ago(-1) },
      ],
    });
    await prisma.notification.createMany({
      data: [
        { userId: seller.id, type: 'x', title: 'Old', createdAt: ago(400) },
        { userId: seller.id, type: 'x', title: 'New' },
      ],
    });
    await prisma.listingDailyStat.createMany({
      data: [
        { listingId: listing.id, day: ago(800), views: 3 },
        { listingId: listing.id, day: ago(1), views: 2 },
      ],
    });
    await prisma.auditLog.createMany({
      data: [
        { action: 'old', ip: '1.2.3.4', userAgent: 'UA', createdAt: ago(400) },
        { action: 'new', ip: '5.6.7.8', userAgent: 'UA' },
      ],
    });

    const result = await runRetention();
    expect(result).toMatchObject({
      authTokens: 1,
      notifications: 1,
      listingStats: 1,
      auditNetwork: 1,
    });
    expect((await prisma.notification.findMany()).map((n) => n.title)).toEqual(['New']);
    const audit = await prisma.auditLog.findMany({ orderBy: { action: 'asc' } });
    expect(audit.map((a) => [a.action, a.ip])).toEqual([
      ['new', '5.6.7.8'],
      ['old', null],
    ]);
    // Running it again changes nothing.
    expect(await runRetention()).toMatchObject({
      authTokens: 0,
      notifications: 0,
      auditNetwork: 0,
    });
  });

  it('warns dormant accounts, removes them 30 days later, and spares active or busy ones', async () => {
    const old = { createdAt: ago(1200), lastLoginAt: ago(1150) };
    const dormant = await createUser({ name: 'Asha Mwita', ...old, locale: 'sw' });
    const busySeller = (await createSeller('TZ', { ...old })).user;
    const buyer = await createUser({ countryCode: 'TZ' });
    const recent = await createUser({ createdAt: ago(1200), lastActiveAt: ago(5) });
    const admin = await createUser({ role: 'ADMIN', ...old });

    // An open order keeps an account, however old.
    const listing = await createListing(busySeller);
    const client = await testClient(createApp());
    await client.post('/auth/login', { email: buyer.email, password: TEST_PASSWORD });
    await client.post('/orders', { listingId: listing.id, quantity: 1, deliveryMethod: 'PICKUP' });
    testOutbox.length = 0; // the seller's "New order" email

    expect(await runRetention()).toMatchObject({ dormantWarned: 1, dormantRemoved: 0 });
    expect(testOutbox.map((m) => [m.to, m.subject])).toEqual([
      [dormant.email, 'Akaunti yako ya TZed itafungwa'],
    ]);
    // Not again the next day, and not removed before the 30 days are up.
    expect(await runRetention(new Date(Date.now() + 29 * DAY))).toMatchObject({
      dormantWarned: 0,
      dormantRemoved: 0,
    });

    expect(await runRetention(new Date(Date.now() + 31 * DAY))).toMatchObject({
      dormantRemoved: 1,
    });
    const gone = await prisma.user.findUniqueOrThrow({ where: { id: dormant.id } });
    expect(gone).toMatchObject({ status: 'DELETED', name: 'Deleted user', phone: null });
    for (const id of [busySeller.id, recent.id, admin.id]) {
      expect((await prisma.user.findUniqueOrThrow({ where: { id } })).status).toBe('ACTIVE');
    }
  });

  it('cancels the countdown when the person comes back', async () => {
    const user = await createUser({ createdAt: ago(1200), lastLoginAt: ago(1150) });
    await runRetention();
    expect(
      (await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).dormantWarnedAt,
    ).not.toBeNull();

    const client = await testClient(createApp());
    await client.post('/auth/login', { email: user.email, password: TEST_PASSWORD });
    await client.get('/me/counts');
    const back = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(back.dormantWarnedAt).toBeNull();
    expect(await runRetention(new Date(Date.now() + 31 * DAY))).toMatchObject({
      dormantWarned: 0,
      dormantRemoved: 0,
    });
  });
});

describe('download my data', () => {
  it('includes order history and problems, with only the messages the person wrote', async () => {
    const { user: seller } = await createSeller('TZ');
    const listing = await createListing(seller);
    const buyer = await createUser({ countryCode: 'TZ' });
    const app = createApp();
    const b = await testClient(app);
    await b.post('/auth/login', { email: buyer.email, password: TEST_PASSWORD });
    const s = await testClient(app);
    await s.post('/auth/login', { email: seller.email, password: TEST_PASSWORD });
    const orderId = (
      await b.post('/orders', { listingId: listing.id, quantity: 1, deliveryMethod: 'PICKUP' })
    ).body.order.id;
    await s.post(`/orders/${orderId}/accept`);
    const dispute = (
      await b.post(`/orders/${orderId}/dispute`, {
        reason: 'OTHER',
        details: 'The seller has not replied for a week.',
      })
    ).body.dispute;
    await s.post(`/disputes/${dispute.id}/messages`, { body: 'Sorry, I was travelling.' });

    const res = await s.get('/me/export');
    expect(res.status).toBe(200);
    expect(res.headers['content-disposition']).toMatch(/attachment; filename="?tzed-data-/);
    const data = JSON.parse(res.text);
    expect(data.profile).toMatchObject({ email: seller.email, locale: 'en' });
    expect(data.ordersAsSeller[0].events.map((e: { type: string }) => e.type)).toContain(
      'accepted',
    );
    expect(data.orderProblems).toHaveLength(1);
    expect(data.orderProblems[0].messagesYouSent.map((m: { body: string }) => m.body)).toEqual([
      'Sorry, I was travelling.',
    ]);
    expect(await prisma.auditLog.count({ where: { action: 'user.data_export' } })).toBe(1);
  });
});
