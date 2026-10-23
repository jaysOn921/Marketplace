import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { seedReferenceData } from '../../../prisma/seed.js';
import { createApp } from '../../app.js';
import { prisma } from '../../db.js';
import { testOutbox } from '../../lib/mailer.js';
import { testClient } from '../../test/client.js';
import { resetDb } from '../../test/db.js';
import { createUser, TEST_PASSWORD } from '../../test/factories.js';

const app = createApp();

beforeEach(async () => {
  await resetDb();
  await seedReferenceData(prisma); // includes the help articles
  testOutbox.length = 0;
});

describe('help articles', () => {
  it('lists articles with topic counts', async () => {
    const res = await request(app).get('/api/v1/help/articles');
    expect(res.body.articles.length).toBeGreaterThanOrEqual(9);
    expect(res.body.topics).toEqual(expect.arrayContaining([{ topic: 'selling', count: 2 }]));
    expect(res.body.articles[0]).toMatchObject({
      slug: expect.any(String),
      excerpt: expect.any(String),
    });
    expect(
      (await request(app).get('/api/v1/help/articles?topic=safety')).body.articles,
    ).toHaveLength(2);
  });

  it('searches with word beginnings and falls back to any word', async () => {
    const conv = await request(app).get('/api/v1/help/articles?q=conver');
    expect(conv.body.articles[0].slug).toBe('currency-converter');
    expect(conv.body.matchMode).toBe('all');

    const customs = await request(app).get('/api/v1/help/articles?q=customs');
    expect(customs.body.articles.map((a: { slug: string }) => a.slug)).toContain(
      'buying-across-the-border',
    );

    const any = await request(app).get('/api/v1/help/articles?q=ivory+zebrafish');
    expect(any.body.matchMode).toBe('any');
    expect(any.body.articles[0].slug).toBe('prohibited-items');
  });

  it('shows one article with related ones', async () => {
    const res = await request(app).get('/api/v1/help/articles/listing-approval');
    expect(res.body.article).toMatchObject({
      title: 'Why is my listing pending review?',
      topic: 'selling',
    });
    expect(res.body.article.body).toContain('reviewed by a TZed admin');
    expect(res.body.related.map((a: { slug: string }) => a.slug)).toEqual(['prohibited-items']);
    expect((await request(app).get('/api/v1/help/articles/nope')).status).toBe(404);
  });
});

describe('support tickets', () => {
  const ticket = {
    subject: 'Seller has not replied',
    body: 'I ordered a phone three days ago and the seller has not replied.',
  };

  it('lets guests open a ticket and follow it with the private link only', async () => {
    const guest = await testClient(app);
    expect((await guest.post('/support/tickets', ticket)).status).toBe(400); // name + email needed
    const res = await guest.post('/support/tickets', {
      ...ticket,
      name: 'Juma',
      email: 'Juma@Example.com',
    });
    expect(res.status).toBe(201);
    const { id, token } = res.body;
    expect(token).toEqual(expect.any(String));

    const mail = testOutbox.find((m) => m.to === 'juma@example.com')!;
    expect(mail.subject).toContain(`[#${id}]`);
    expect(mail.text).toContain(`/support/tickets/${id}?token=`);

    expect((await request(app).get(`/api/v1/support/tickets/${id}`)).status).toBe(404);
    expect(
      (await request(app).get(`/api/v1/support/tickets/${id}?token=wrong-token-123`)).status,
    ).toBe(404);
    const view = await request(app).get(`/api/v1/support/tickets/${id}?token=${token}`);
    expect(view.body.ticket).toMatchObject({
      subject: ticket.subject,
      status: 'OPEN',
      name: 'Juma',
      messages: [{ fromStaff: false }],
    });

    const reply = await guest.post(`/support/tickets/${id}/messages?token=${token}`, {
      body: 'Order number is #12, thank you.',
    });
    expect(reply.body.ticket.messages).toHaveLength(2);
    const closed = await guest.post(`/support/tickets/${id}/close?token=${token}`);
    expect(closed.body.ticket.status).toBe('CLOSED');
    expect(
      (
        await guest.post(`/support/tickets/${id}/messages?token=${token}`, {
          body: 'One more thing here.',
        })
      ).status,
    ).toBe(409);
  });

  it('uses the account for signed-in users and lists their tickets', async () => {
    const user = await createUser({ name: 'Baraka Said' });
    const client = await testClient(app);
    await client.post('/auth/login', { email: user.email, password: TEST_PASSWORD });
    const res = await client.post('/support/tickets', ticket);
    expect(res.body.token).toBeNull();
    const t = await prisma.supportTicket.findUniqueOrThrow({ where: { id: res.body.id } });
    expect(t).toMatchObject({
      userId: user.id,
      email: user.email,
      name: 'Baraka Said',
      accessTokenHash: null,
    });
    expect((await client.get('/support/tickets')).body.tickets).toEqual([
      expect.objectContaining({ id: res.body.id }),
    ]);
    expect((await client.get(`/support/tickets/${res.body.id}`)).status).toBe(200);
    const other = await testClient(app);
    await other.post('/auth/login', { email: (await createUser()).email, password: TEST_PASSWORD });
    expect((await other.get(`/support/tickets/${res.body.id}`)).status).toBe(404);
  });

  it('notifies admins about new tickets', async () => {
    const admin = await createUser({ role: 'ADMIN' });
    await (
      await testClient(app)
    ).post('/support/tickets', { ...ticket, name: 'Juma', email: 'juma@example.com' });
    expect(
      await prisma.notification.count({ where: { userId: admin.id, type: 'ticket.new' } }),
    ).toBe(1);
  });
});
