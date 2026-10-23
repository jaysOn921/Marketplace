import express from 'express';
import session from 'express-session';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { seedReferenceData } from '../../../prisma/seed.js';
import { createApp } from '../../app.js';
import { prisma } from '../../db.js';
import { loadUser, requireAdmin } from '../../middleware/auth.js';
import { errorHandler } from '../../middleware/error-handler.js';
import { testClient } from '../../test/client.js';
import { resetDb } from '../../test/db.js';
import { auditActions, createUser, TEST_PASSWORD } from '../../test/factories.js';

const app = createApp();

async function signedIn(overrides: Parameters<typeof createUser>[0] = {}) {
  const user = await createUser(overrides);
  const client = await testClient(app);
  const res = await client.post('/auth/login', { email: user.email, password: TEST_PASSWORD });
  expect(res.status).toBe(200);
  return { user, client };
}

async function regionId(countryCode: 'TZ' | 'ZM', name: string) {
  const region = await prisma.region.findFirstOrThrow({
    where: { name, country: { code: countryCode } },
  });
  return region.id;
}

beforeEach(async () => {
  await resetDb();
  await seedReferenceData(prisma);
});

describe('account endpoints require sign-in', () => {
  it('returns 401 when signed out', async () => {
    const client = await testClient(app);
    expect((await client.patch('/me', { name: 'X' })).status).toBe(401);
    expect((await client.get('/me/export')).status).toBe(401);
  });
});

describe('PATCH /me', () => {
  it('updates name and phone', async () => {
    const { client } = await signedIn();
    const res = await client.patch('/me', {
      name: 'Baraka Said',
      countryCode: 'TZ',
      phone: '0754 111 222',
    });
    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ name: 'Baraka Said', phone: '+255754111222' });
  });

  it('allows changing country before selling and clears the old region', async () => {
    const { user, client } = await signedIn({ countryCode: 'TZ' });
    await client.put('/me/seller-profile', {
      shopName: 'Baraka Shop',
      regionId: await regionId('TZ', 'Arusha'),
      town: 'Arusha',
    });
    const res = await client.patch('/me', { name: user.name, countryCode: 'ZM' });
    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ countryCode: 'ZM', currency: 'ZMW' });
    expect(res.body.user.sellerProfile.regionId).toBeNull();
    expect(await auditActions(user.id)).toContain('user.country_change');
  });

  it('blocks changing country once the user has listings', async () => {
    const { user, client } = await signedIn({ countryCode: 'TZ' });
    const category = await prisma.category.create({ data: { name: 'Test', slug: 'test' } });
    await prisma.listing.create({
      data: {
        sellerId: user.id,
        categoryId: category.id,
        title: 'Phone',
        description: 'A phone',
        price: '1000',
        currency: 'TZS',
        condition: 'NEW',
        countryId: user.countryId,
        regionId: await regionId('TZ', 'Arusha'),
        town: 'Arusha',
      },
    });
    const res = await client.patch('/me', { name: user.name, countryCode: 'ZM' });
    expect(res.status).toBe(409);
  });
});

describe('POST /me/password', () => {
  it('changes the password and signs out other devices only', async () => {
    const { user, client } = await signedIn();
    const other = await testClient(app);
    await other.post('/auth/login', { email: user.email, password: TEST_PASSWORD });

    const res = await client.post('/me/password', {
      currentPassword: TEST_PASSWORD,
      newPassword: 'new-password-123',
    });
    expect(res.status).toBe(200);
    expect((await client.get('/auth/me')).body.user?.id).toBe(user.id);
    expect((await other.get('/auth/me')).body.user).toBeNull();
    expect(await auditActions(user.id)).toContain('auth.password_change');
  });

  it('rejects a wrong current password with a field error', async () => {
    const { client } = await signedIn();
    const res = await client.post('/me/password', {
      currentPassword: 'nope',
      newPassword: 'new-password-123',
    });
    expect(res.status).toBe(400);
    expect(res.body.error.details.fields.currentPassword).toBeDefined();
  });
});

describe('PUT /me/seller-profile', () => {
  it('creates a seller profile with a unique, stable shop link', async () => {
    const mbeya = await regionId('TZ', 'Mbeya');
    const first = await signedIn();
    await first.client.put('/me/seller-profile', {
      shopName: 'Mbeya Crafts',
      regionId: mbeya,
      town: 'Mbeya',
    });

    const { client } = await signedIn();
    const res = await client.put('/me/seller-profile', {
      shopName: 'Mbeya Crafts',
      regionId: mbeya,
      town: 'Mbeya',
      contactPreference: 'BOTH',
      bio: 'Kitenge and carvings',
    });
    expect(res.status).toBe(200);
    expect(res.body.user.sellerProfile).toMatchObject({
      shopName: 'Mbeya Crafts',
      slug: 'mbeya-crafts-2',
      regionName: 'Mbeya',
      contactPreference: 'BOTH',
    });

    const renamed = await client.put('/me/seller-profile', {
      shopName: 'New Name',
      regionId: mbeya,
      town: 'Mbeya',
    });
    expect(renamed.body.user.sellerProfile).toMatchObject({
      shopName: 'New Name',
      slug: 'mbeya-crafts-2',
    });
  });

  it('rejects a region from the other country', async () => {
    const { client } = await signedIn({ countryCode: 'TZ' });
    const res = await client.put('/me/seller-profile', {
      shopName: 'Shop',
      regionId: await regionId('ZM', 'Lusaka'),
      town: 'Lusaka',
    });
    expect(res.status).toBe(400);
    expect(res.body.error.details.fields.regionId).toBeDefined();
  });
});

describe('GET /me/export', () => {
  it('downloads the user data as JSON and logs it', async () => {
    const { user, client } = await signedIn();
    const res = await client.get('/me/export');
    expect(res.status).toBe(200);
    expect(res.headers['content-disposition']).toMatch(
      /attachment; filename="?tzed-data-\d{4}-\d{2}-\d{2}\.json/,
    );
    expect(res.body.profile).toMatchObject({ id: user.id, email: user.email });
    expect(res.body.profile).not.toHaveProperty('passwordHash');
    expect(res.body).toHaveProperty('ordersAsBuyer');
    expect(await auditActions(user.id)).toContain('user.data_export');
  });
});

describe('DELETE /me', () => {
  it('removes personal data, signs out everywhere and blocks login', async () => {
    const { user, client } = await signedIn({ phone: '+255712345678' });
    await client.put('/me/seller-profile', {
      shopName: 'Shop',
      regionId: await regionId('TZ', 'Arusha'),
      town: 'Arusha',
    });

    expect((await client.delete('/me', { password: 'wrong' })).status).toBe(400);
    expect((await client.delete('/me', { password: TEST_PASSWORD })).status).toBe(204);

    const row = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(row).toMatchObject({ status: 'DELETED', name: 'Deleted user', phone: null });
    expect(row.email).toBe(`deleted-${user.id}@deleted.invalid`);
    expect(await prisma.sellerProfile.count({ where: { userId: user.id } })).toBe(0);
    expect(await prisma.session.count({ where: { userId: user.id } })).toBe(0);
    expect((await client.get('/auth/me')).body.user).toBeNull();

    await client.refreshCsrf();
    expect(
      (await client.post('/auth/login', { email: user.email, password: TEST_PASSWORD })).status,
    ).toBe(401);
    expect(await auditActions(user.id)).toContain('user.delete');
  });
});

describe('requireAdmin', () => {
  // A minimal app with an admin-only route, until the admin module exists.
  function adminApp(userId: number) {
    const mini = express();
    mini.use(session({ secret: 'test', resave: false, saveUninitialized: true }));
    mini.use((req, _res, next) => {
      req.session.userId = userId;
      next();
    });
    mini.use(loadUser);
    mini.get('/admin-only', requireAdmin, (_req, res) => res.json({ ok: true }));
    mini.use(errorHandler);
    return mini;
  }

  it('allows admins and refuses everyone else', async () => {
    const admin = await createUser({ role: 'ADMIN' });
    const user = await createUser();
    expect((await request(adminApp(admin.id)).get('/admin-only')).status).toBe(200);
    expect((await request(adminApp(user.id)).get('/admin-only')).status).toBe(403);
    expect((await request(adminApp(999_999)).get('/admin-only')).status).toBe(401);
  });
});
