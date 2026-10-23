import request from 'supertest';
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

let admin: Awaited<ReturnType<typeof signIn>>;
let adminId: number;

beforeEach(async () => {
  await resetDb();
  await seedReferenceData(prisma); // rate 1 ZMW = 105 TZS
  testOutbox.length = 0;
  const a = await createUser({ role: 'ADMIN', name: 'Admin Asha' });
  adminId = a.id;
  admin = await signIn(a.email);
});

describe('admin access', () => {
  it('is for admins only', async () => {
    const user = await signIn((await createUser()).email);
    for (const path of [
      '/admin/stats',
      '/admin/users',
      '/admin/listings',
      '/admin/tickets',
      '/admin/rates',
      '/admin/audit',
    ]) {
      expect((await user.get(path)).status).toBe(403);
    }
    expect((await request(app).get('/api/v1/admin/stats')).status).toBe(401);
  });
});

describe('dashboard', () => {
  it('summarises users, listings, orders, waiting work and the rate', async () => {
    const { user: seller } = await createSeller('TZ');
    await createListing(seller);
    await createListing(seller, { status: 'PENDING_REVIEW' });
    await createUser({ countryCode: 'ZM' });
    const res = await admin.get('/admin/stats');
    expect(res.body).toMatchObject({
      users: { total: 3, byCountry: { TZ: 2, ZM: 1 }, suspended: 0 },
      listings: { ACTIVE: 1, PENDING_REVIEW: 1 },
      waiting: { reviewQueue: 1, openReports: 0, openTickets: 0 },
      rate: { rate: 105, daysOld: 0 },
    });
  });
});

describe('users', () => {
  it('searches users and suspends / reinstates with a reason', async () => {
    const u = await createUser({ name: 'Peter Chanda', email: 'peter@example.com' });
    await createUser({ name: 'Someone Else' });
    const list = await admin.get('/admin/users?q=peter');
    expect(list.body).toMatchObject({
      total: 1,
      rows: [{ id: u.id, name: 'Peter Chanda', status: 'ACTIVE' }],
    });

    const userClient = await signIn(u.email);
    expect((await admin.post(`/admin/users/${u.id}/suspend`, {})).status).toBe(400); // reason needed
    expect(
      (await admin.post(`/admin/users/${u.id}/suspend`, { reason: 'Repeated scam reports' }))
        .status,
    ).toBe(200);
    expect((await userClient.get('/auth/me')).body.user).toBeNull();
    expect(testOutbox.at(-1)).toMatchObject({
      to: u.email,
      subject: expect.stringContaining('suspended'),
    });
    expect((await admin.get('/admin/users?status=SUSPENDED')).body.total).toBe(1);

    expect(
      (await admin.post(`/admin/users/${u.id}/reinstate`, { reason: 'Cleared after review' }))
        .status,
    ).toBe(200);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: u.id } })).status).toBe('ACTIVE');
    expect(await auditActions(adminId)).toEqual(
      expect.arrayContaining(['user.suspend', 'user.reinstate']),
    );
  });

  it("can't suspend admins or yourself", async () => {
    const other = await createUser({ role: 'ADMIN' });
    expect(
      (await admin.post(`/admin/users/${other.id}/suspend`, { reason: 'test reason' })).status,
    ).toBe(400);
    expect(
      (await admin.post(`/admin/users/${adminId}/suspend`, { reason: 'test reason' })).status,
    ).toBe(400);
  });
});

describe('listings', () => {
  it('finds listings in any status, removes and restores them', async () => {
    const { user: seller } = await createSeller('TZ');
    const live = await createListing(seller, { title: 'Live phone' });
    await createListing(seller, { title: 'Draft phone', status: 'DRAFT', publishedAt: null });
    expect((await admin.get('/admin/listings?q=phone')).body.total).toBe(2);
    expect((await admin.get('/admin/listings?status=DRAFT')).body.rows[0].title).toBe(
      'Draft phone',
    );

    expect(
      (await admin.post(`/admin/listings/${live.id}/remove`, { reason: 'Prohibited item' })).body
        .status,
    ).toBe('REMOVED');
    expect((await request(app).get(`/api/v1/listings/${live.id}`)).status).toBe(404);
    expect(
      await prisma.notification.findFirst({
        where: { userId: seller.id, type: 'listing.removed' },
      }),
    ).not.toBeNull();
    expect(
      (await admin.post(`/admin/listings/${live.id}/restore`, { reason: 'Removed by mistake' }))
        .body.status,
    ).toBe('ACTIVE');
    expect(
      (await admin.post(`/admin/listings/${live.id}/restore`, { reason: 'again' })).status,
    ).toBe(409);
    expect(await auditActions(adminId)).toEqual(
      expect.arrayContaining(['listing.remove', 'listing.restore']),
    );
  });
});

describe('support tickets', () => {
  it('replies to a guest ticket with a fresh private link, and closes it', async () => {
    const guest = await testClient(app);
    const created = await guest.post('/support/tickets', {
      name: 'Juma',
      email: 'juma@example.com',
      subject: 'Delivery to Ndola',
      body: 'Do sellers send to Ndola please?',
    });
    const { id, token } = created.body;

    expect((await admin.get('/admin/tickets?status=OPEN')).body.rows).toEqual([
      expect.objectContaining({ id, isGuest: true, messages: 1 }),
    ]);
    expect((await admin.get(`/support/tickets/${id}`)).status).toBe(200); // admins can read any ticket

    testOutbox.length = 0;
    expect(
      (
        await admin.post(`/admin/tickets/${id}/reply`, {
          body: 'Yes, many sellers in Mbeya send to Ndola.',
        })
      ).status,
    ).toBe(201);
    const mail = testOutbox.at(-1)!;
    expect(mail).toMatchObject({
      to: 'juma@example.com',
      subject: `Re: Delivery to Ndola [#${id}]`,
    });
    const newToken = decodeURIComponent(/token=([^\s]+)/.exec(mail.text)![1]!);
    expect(newToken).not.toBe(token);

    const view = await request(app).get(
      `/api/v1/support/tickets/${id}?token=${encodeURIComponent(newToken)}`,
    );
    expect(view.body.ticket).toMatchObject({
      status: 'ANSWERED',
      messages: [{ fromStaff: false }, { fromStaff: true }],
    });
    expect((await admin.post(`/admin/tickets/${id}/close`)).status).toBe(200);
    expect((await admin.get('/admin/tickets?status=CLOSED')).body.total).toBe(1);
    expect(await auditActions(adminId)).toEqual(
      expect.arrayContaining(['ticket.reply', 'ticket.close']),
    );
  });

  it('notifies signed-in users in the app too', async () => {
    const u = await createUser();
    const client = await signIn(u.email);
    const { id } = (
      await client.post('/support/tickets', {
        subject: 'Help please',
        body: 'My order has not arrived yet.',
      })
    ).body;
    await admin.post(`/admin/tickets/${id}/reply`, {
      body: 'We are checking with the seller.',
      close: false,
    });
    expect(
      await prisma.notification.findFirst({ where: { userId: u.id, type: 'ticket.reply' } }),
    ).not.toBeNull();
  });
});

describe('exchange rate', () => {
  it('sets a new rate used everywhere, asks to confirm big changes, and keeps history', async () => {
    expect(
      (await admin.post('/admin/rates', { rate: 110.25, note: 'Bank of Zambia mid-rate' })).status,
    ).toBe(201);
    expect((await request(app).get('/api/v1/rates')).body.rates[0].rate).toBe(110.25);

    const big = await admin.post('/admin/rates', { rate: 150 });
    expect(big.status).toBe(409);
    expect(big.body.error.code).toBe('LARGE_RATE_CHANGE');
    expect((await admin.post('/admin/rates', { rate: 150, confirmLargeChange: true })).status).toBe(
      201,
    );
    expect((await admin.post('/admin/rates', { rate: 0.5 })).status).toBe(400);

    const history = (await admin.get('/admin/rates')).body.history;
    expect(history.map((h: { rate: number }) => h.rate)).toEqual([150, 110.25, 105]);
    expect(history[1]).toMatchObject({ note: 'Bank of Zambia mid-rate', setBy: 'Admin Asha' });
    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { action: 'fx.update' },
      orderBy: { id: 'asc' },
    });
    expect(audit).toMatchObject({ before: { rate: 105 }, after: { rate: 110.25 } });
  });
});

describe('categories and help articles', () => {
  it('creates, renames and hides categories', async () => {
    const parent = await prisma.category.findUniqueOrThrow({ where: { slug: 'electronics' } });
    const created = await admin.post('/admin/categories', {
      name: 'Solar & power',
      parentId: parent.id,
    });
    expect(created.status).toBe(201);
    const cat = await prisma.category.findUniqueOrThrow({ where: { id: created.body.id } });
    expect(cat).toMatchObject({ slug: 'solar-power', parentId: parent.id, isActive: true });

    await admin.put(`/admin/categories/${cat.id}`, {
      name: 'Solar panels & power',
      parentId: parent.id,
      isActive: false,
    });
    const tree = (await request(app).get('/api/v1/categories')).body.categories;
    const electronics = tree.find((c: { slug: string }) => c.slug === 'electronics');
    expect(electronics.children.map((c: { slug: string }) => c.slug)).not.toContain('solar-power');
    expect(
      (await admin.put(`/admin/categories/${parent.id}`, { name: 'Electronics', parentId: cat.id }))
        .status,
    ).toBe(400);
    expect(await auditActions(adminId)).toEqual(
      expect.arrayContaining(['category.create', 'category.update']),
    );
  });

  it('writes and unpublishes help articles', async () => {
    const res = await admin.post('/admin/help/articles', {
      title: 'Paying with mobile money',
      topic: 'payments',
      body: 'Agree the mobile money method with the seller before paying.',
    });
    expect(res.status).toBe(201);
    expect((await request(app).get('/api/v1/help/articles/paying-with-mobile-money')).status).toBe(
      200,
    );
    await admin.put(`/admin/help/articles/${res.body.id}`, {
      title: 'Paying with mobile money',
      topic: 'payments',
      body: 'Agree the mobile money method with the seller before paying.',
      isPublished: false,
    });
    expect((await request(app).get('/api/v1/help/articles/paying-with-mobile-money')).status).toBe(
      404,
    );
    expect(
      (await admin.get('/admin/help/articles')).body.articles.some(
        (a: { slug: string }) => a.slug === 'paying-with-mobile-money',
      ),
    ).toBe(true);
  });
});

describe('audit log', () => {
  it('lists admin actions newest first with filters, and hides sign-ins unless asked', async () => {
    await admin.post('/admin/rates', { rate: 106 });
    const u = await createUser();
    await admin.post(`/admin/users/${u.id}/suspend`, { reason: 'test reason' });

    const all = await admin.get('/admin/audit');
    expect(all.body.rows.map((r: { action: string }) => r.action)).toEqual([
      'user.suspend',
      'fx.update',
    ]);
    expect(all.body.rows[0]).toMatchObject({
      actorName: 'Admin Asha',
      targetType: 'user',
      targetId: u.id,
    });
    expect(all.body.actions).toEqual(
      expect.arrayContaining(['auth.login', 'fx.update', 'user.suspend']),
    );

    expect((await admin.get('/admin/audit?action=fx.update')).body.total).toBe(1);
    expect((await admin.get(`/admin/audit?targetType=user&targetId=${u.id}`)).body.total).toBe(1);
    expect(
      (await admin.get('/admin/audit?include=all')).body.rows.some(
        (r: { action: string }) => r.action === 'auth.login',
      ),
    ).toBe(true);
    expect((await admin.get('/admin/audit?from=2000-01-01&to=2000-12-31')).body.total).toBe(0);
  });
});
