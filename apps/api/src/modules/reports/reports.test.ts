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
  const { user: seller } = await createSeller('TZ');
  const listing = await createListing(seller, {
    crossBorder: true,
    title: 'Replica designer handbag',
  });
  const reporterA = await createUser({ countryCode: 'ZM', name: 'Natasha Phiri' });
  const reporterB = await createUser({ countryCode: 'TZ', name: 'Baraka Said' });
  const admin = await createUser({ role: 'ADMIN' });
  return {
    seller,
    listing,
    reporterA,
    reporterB,
    a: await signIn(reporterA.email),
    b: await signIn(reporterB.email),
    sellerClient: await signIn(seller.email),
    adminClient: await signIn(admin.email),
    admin,
  };
}

beforeEach(async () => {
  await resetDb();
  await seedReferenceData(prisma);
});

describe('reporting', () => {
  it('reports a listing once per person, and needs details for "other"', async () => {
    const { listing, a } = await setup();
    const report = { targetType: 'LISTING', targetId: listing.id, reason: 'PROHIBITED_ITEM' };
    expect((await a.post('/reports', report)).status).toBe(201);
    expect((await a.post('/reports', report)).status).toBe(409);
    expect(
      (await a.post('/reports', { ...report, reason: 'OTHER' })).body.error.details.fields.details,
    ).toBeDefined();
  });

  it("refuses reporting yourself, your own listing, or messages you can't see", async () => {
    const { seller, listing, sellerClient, a, b } = await setup();
    expect(
      (
        await sellerClient.post('/reports', {
          targetType: 'LISTING',
          targetId: listing.id,
          reason: 'SCAM',
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await sellerClient.post('/reports', {
          targetType: 'USER',
          targetId: seller.id,
          reason: 'SCAM',
        })
      ).status,
    ).toBe(400);
    const conv = await a.post('/conversations', { listingId: listing.id, body: 'Hello' });
    const msgId = conv.body.messages[0].id;
    expect(
      (await a.post('/reports', { targetType: 'MESSAGE', targetId: msgId, reason: 'OFFENSIVE' }))
        .status,
    ).toBe(400); // own message
    expect(
      (await b.post('/reports', { targetType: 'MESSAGE', targetId: msgId, reason: 'OFFENSIVE' }))
        .status,
    ).toBe(404); // not in it
    expect(
      (
        await sellerClient.post('/reports', {
          targetType: 'MESSAGE',
          targetId: msgId,
          reason: 'OFFENSIVE',
        })
      ).status,
    ).toBe(201);
  });
});

describe('admin reports queue', () => {
  it('groups reports by target, most reported first, and counts them in the badge', async () => {
    const { listing, seller, a, b, adminClient } = await setup();
    await a.post('/reports', {
      targetType: 'LISTING',
      targetId: listing.id,
      reason: 'PROHIBITED_ITEM',
      details: 'Counterfeit',
    });
    await b.post('/reports', { targetType: 'LISTING', targetId: listing.id, reason: 'SCAM' });
    await a.post('/reports', { targetType: 'USER', targetId: seller.id, reason: 'SCAM' });

    expect((await a.get('/admin/reports')).status).toBe(403);
    const res = await adminClient.get('/admin/reports');
    expect(res.body.groups).toHaveLength(2);
    expect(res.body.groups[0]).toMatchObject({
      targetType: 'LISTING',
      targetId: listing.id,
      count: 2,
      reasons: { PROHIBITED_ITEM: 1, SCAM: 1 },
      target: { label: 'Replica designer handbag', ownerId: seller.id, status: 'ACTIVE' },
      reports: [
        { reporterName: 'Natasha P.', details: 'Counterfeit' },
        { reporterName: 'Baraka S.' },
      ],
    });
    expect((await adminClient.get('/me/counts')).body.openReports).toBe(2);
  });

  it('acting removes the listing, suspends the seller, logs it and tells everyone', async () => {
    const { listing, seller, reporterA, reporterB, a, b, sellerClient, adminClient, admin } =
      await setup();
    await a.post('/reports', {
      targetType: 'LISTING',
      targetId: listing.id,
      reason: 'PROHIBITED_ITEM',
    });
    await b.post('/reports', {
      targetType: 'LISTING',
      targetId: listing.id,
      reason: 'PROHIBITED_ITEM',
    });

    const resolve = {
      targetType: 'LISTING',
      targetId: listing.id,
      decision: 'action',
      note: 'Counterfeit goods are not allowed.',
    };
    expect(
      (await adminClient.post('/admin/reports/resolve', { ...resolve, actions: [] })).status,
    ).toBe(400);
    expect(
      (
        await adminClient.post('/admin/reports/resolve', {
          ...resolve,
          actions: ['remove_message'],
        })
      ).status,
    ).toBe(400);
    const res = await adminClient.post('/admin/reports/resolve', {
      ...resolve,
      actions: ['remove_listing', 'suspend_user'],
    });
    expect(res.status).toBe(200);

    expect((await prisma.listing.findUniqueOrThrow({ where: { id: listing.id } })).status).toBe(
      'REMOVED',
    );
    expect((await prisma.user.findUniqueOrThrow({ where: { id: seller.id } })).status).toBe(
      'SUSPENDED',
    );
    expect((await sellerClient.get('/auth/me')).body.user).toBeNull(); // signed out
    expect(
      await prisma.report.count({ where: { status: 'ACTIONED', resolvedById: admin.id } }),
    ).toBe(2);
    expect(await auditActions(admin.id)).toEqual(
      expect.arrayContaining(['listing.remove', 'user.suspend', 'report.resolve']),
    );
    for (const r of [reporterA, reporterB]) {
      const n = await prisma.notification.findFirstOrThrow({
        where: { userId: r.id, type: 'report.resolved' },
      });
      expect(n.body).toContain('took action');
    }
    expect((await adminClient.get('/admin/reports')).body.groups).toEqual([]);
    expect(
      (
        await adminClient.post('/admin/reports/resolve', {
          ...resolve,
          actions: ['remove_listing'],
        })
      ).status,
    ).toBe(409);
  });

  it('dismissing keeps everything and tells reporters no breach was found', async () => {
    const { listing, reporterA, a, adminClient } = await setup();
    await a.post('/reports', {
      targetType: 'LISTING',
      targetId: listing.id,
      reason: 'WRONG_CATEGORY',
    });
    await adminClient.post('/admin/reports/resolve', {
      targetType: 'LISTING',
      targetId: listing.id,
      decision: 'dismiss',
      note: 'Category is correct.',
    });
    expect((await prisma.listing.findUniqueOrThrow({ where: { id: listing.id } })).status).toBe(
      'ACTIVE',
    );
    const n = await prisma.notification.findFirstOrThrow({
      where: { userId: reporterA.id, type: 'report.resolved' },
    });
    expect(n.body).toContain("didn't find a breach");
    // A later report shows the earlier one was resolved.
    await a.post('/reports', { targetType: 'LISTING', targetId: listing.id, reason: 'SCAM' });
    expect((await adminClient.get('/admin/reports')).body.groups[0].previouslyResolved).toBe(1);
  });

  it('removing a message hides its text in the conversation', async () => {
    const { listing, a, sellerClient, adminClient } = await setup();
    const conv = await a.post('/conversations', {
      listingId: listing.id,
      body: 'Pay me outside TZed and I will give you a discount',
    });
    const msgId = conv.body.messages[0].id;
    await sellerClient.post('/reports', { targetType: 'MESSAGE', targetId: msgId, reason: 'SCAM' });
    await adminClient.post('/admin/reports/resolve', {
      targetType: 'MESSAGE',
      targetId: msgId,
      decision: 'action',
      actions: ['remove_message'],
      note: 'Asking to pay outside the platform.',
    });
    const thread = await sellerClient.get(`/conversations/${conv.body.conversation.id}`);
    expect(thread.body.messages[0]).toMatchObject({ removed: true, body: '' });
    expect((await sellerClient.get('/conversations')).body.conversations[0].lastMessage.body).toBe(
      'Message removed',
    );
  });

  it("won't suspend an admin from a report", async () => {
    const { admin, a, adminClient } = await setup();
    await a.post('/reports', { targetType: 'USER', targetId: admin.id, reason: 'OFFENSIVE' });
    const res = await adminClient.post('/admin/reports/resolve', {
      targetType: 'USER',
      targetId: admin.id,
      decision: 'action',
      actions: ['suspend_user'],
      note: 'test',
    });
    expect(res.status).toBe(400);
  });
});
