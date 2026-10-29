import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { seedReferenceData } from '../../../prisma/seed.js';
import { createApp } from '../../app.js';
import { prisma } from '../../db.js';
import { testOutbox } from '../../lib/mailer.js';
import { testClient } from '../../test/client.js';
import { resetDb } from '../../test/db.js';
import { auditActions, createUser, settle, TEST_PASSWORD } from '../../test/factories.js';

const app = createApp();

const registration = {
  name: 'Natasha Phiri',
  email: 'Natasha@Example.com',
  password: 'a-good-password',
  countryCode: 'ZM',
  phone: '0977 123 456',
  consent: true,
  adult: true,
};

/** Pulls the token out of the last email's link. */
function tokenFromLastEmail() {
  const text = testOutbox.at(-1)?.text ?? '';
  return decodeURIComponent(/token=([^\s]+)/.exec(text)?.[1] ?? '');
}

beforeEach(async () => {
  await resetDb();
  await seedReferenceData(prisma);
  testOutbox.length = 0;
});

describe('CSRF protection', () => {
  it('rejects writes without a valid token', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'a@b.co', password: 'x' });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('CSRF_INVALID');

    const agent = request.agent(app);
    await agent.get('/api/v1/auth/csrf');
    const wrong = await agent
      .post('/api/v1/auth/login')
      .set('X-CSRF-Token', 'not-the-token')
      .send({ email: 'a@b.co', password: 'x' });
    expect(wrong.status).toBe(403);
  });

  it('allows reads without a token', async () => {
    expect((await request(app).get('/api/v1/auth/me')).body).toEqual({ user: null });
  });
});

describe('registration', () => {
  it('creates the account, signs the user in and sends a verification email', async () => {
    const client = await testClient(app);
    const res = await client.post('/auth/register', registration);

    expect(res.status).toBe(201);
    expect(res.body.user).toMatchObject({
      email: 'natasha@example.com',
      name: 'Natasha Phiri',
      phone: '+260977123456',
      countryCode: 'ZM',
      currency: 'ZMW',
      role: 'USER',
      emailVerified: false,
      sellerProfile: null,
    });
    expect(res.body.user).not.toHaveProperty('passwordHash');

    const me = await client.get('/auth/me');
    expect(me.body.user.email).toBe('natasha@example.com');

    const user = await prisma.user.findUniqueOrThrow({ where: { email: 'natasha@example.com' } });
    expect(user.passwordHash).toMatch(/^\$argon2id\$/);
    expect(user.consentAt).not.toBeNull();
    expect(user.ageConfirmedAt).not.toBeNull();
    expect(user.marketingOptInAt).toBeNull(); // only when they tick the box
    expect(res.body.user.marketingEmails).toBe(false);
    expect(testOutbox).toHaveLength(1);
    expect(testOutbox[0]).toMatchObject({
      to: 'natasha@example.com',
      subject: expect.stringContaining('Confirm'),
    });
    expect(await auditActions(user.id)).toContain('auth.register');
  });

  it('rejects a duplicate email', async () => {
    await createUser({ email: 'natasha@example.com' });
    const client = await testClient(app);
    const res = await client.post('/auth/register', registration);
    expect(res.status).toBe(409);
  });

  it('returns field errors for invalid input', async () => {
    const client = await testClient(app);
    const res = await client.post('/auth/register', {
      ...registration,
      email: 'nope',
      password: 'short',
      consent: false,
      adult: false,
    });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(Object.keys(res.body.error.details.fields)).toEqual(
      expect.arrayContaining(['email', 'password', 'consent', 'adult']),
    );
  });
});

describe('age and marketing emails', () => {
  it('refuses sign-up without the 18+ confirmation', async () => {
    const client = await testClient(app);
    const { adult: _, ...rest } = registration;
    const res = await client.post('/auth/register', rest, { 'Accept-Language': 'sw' });
    expect(res.status).toBe(400);
    expect(res.body.error.details.fields.adult).toBe(
      'Lazima uwe na miaka 18 au zaidi kutumia TZed.',
    );
  });

  it('records the marketing choice at sign-up, and lets people change it later', async () => {
    const client = await testClient(app);
    const res = await client.post('/auth/register', { ...registration, marketing: true });
    expect(res.body.user.marketingEmails).toBe(true);

    const off = await client.put('/me/marketing', { marketing: false });
    expect(off.body.user.marketingEmails).toBe(false);
    const user = await prisma.user.findUniqueOrThrow({ where: { email: 'natasha@example.com' } });
    expect(user.marketingOptInAt).toBeNull();
    expect((await client.put('/me/marketing', { marketing: true })).body.user.marketingEmails).toBe(
      true,
    );
    expect(await auditActions(user.id)).toEqual(
      expect.arrayContaining(['user.marketing_opt_out', 'user.marketing_opt_in']),
    );
    expect((await client.put('/me/marketing', {})).status).toBe(400);
  });
});

describe('email verification', () => {
  it('verifies with the emailed link, once', async () => {
    const client = await testClient(app);
    await client.post('/auth/register', registration);
    const token = tokenFromLastEmail();

    expect((await client.post('/auth/verify-email', { token })).status).toBe(200);
    expect((await client.get('/auth/me')).body.user.emailVerified).toBe(true);

    const again = await client.post('/auth/verify-email', { token });
    expect(again.status).toBe(400);
    expect(again.body.error.code).toBe('TOKEN_INVALID');
  });

  it('can resend the verification email', async () => {
    const client = await testClient(app);
    await client.post('/auth/register', registration);
    expect((await client.post('/auth/resend-verification')).status).toBe(200);
    expect(testOutbox).toHaveLength(2);
  });
});

describe('login and logout', () => {
  it('signs in with the right password and out again', async () => {
    const user = await createUser({ email: 'amina@example.com' });
    const client = await testClient(app);

    const res = await client.post('/auth/login', {
      email: 'AMINA@example.com',
      password: TEST_PASSWORD,
    });
    expect(res.status).toBe(200);
    expect(res.body.user.id).toBe(user.id);
    expect(res.body.csrfToken).toEqual(expect.any(String));

    expect((await client.post('/auth/logout')).status).toBe(204);
    expect((await client.get('/auth/me')).body.user).toBeNull();
    await settle();
    expect(await auditActions(user.id)).toEqual(['auth.login', 'auth.logout']);
  });

  it('gives the same error for a wrong password and an unknown email, and logs failures', async () => {
    const user = await createUser({ email: 'amina@example.com' });
    const client = await testClient(app);

    const wrong = await client.post('/auth/login', {
      email: 'amina@example.com',
      password: 'wrong-password',
    });
    const unknown = await client.post('/auth/login', {
      email: 'nobody@example.com',
      password: 'whatever',
    });
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrong.body).toEqual(unknown.body);

    await settle();
    const failures = await prisma.auditLog.findMany({ where: { action: 'auth.login_failed' } });
    expect(failures).toHaveLength(2);
    expect(failures[0]?.actorId).toBe(user.id);
  });

  it('blocks suspended accounts and signs them out immediately', async () => {
    const user = await createUser({ email: 'amina@example.com' });
    const client = await testClient(app);
    await client.post('/auth/login', { email: 'amina@example.com', password: TEST_PASSWORD });

    await prisma.user.update({ where: { id: user.id }, data: { status: 'SUSPENDED' } });
    expect((await client.get('/auth/me')).body.user).toBeNull();

    const again = await client.post('/auth/login', {
      email: 'amina@example.com',
      password: TEST_PASSWORD,
    });
    expect(again.status).toBe(403);
    expect(again.body.error.code).toBe('ACCOUNT_SUSPENDED');
  });

  it('starts a new session id on login (no session fixation)', async () => {
    await createUser({ email: 'amina@example.com' });
    const client = await testClient(app);
    const before = await prisma.session.findMany();
    await client.post('/auth/login', { email: 'amina@example.com', password: TEST_PASSWORD });
    const after = await prisma.session.findMany();
    expect(after).toHaveLength(1);
    expect(after[0]?.id).not.toBe(before[0]?.id);
    expect(after[0]?.userId).not.toBeNull();
  });
});

describe('password reset', () => {
  it('resets with the emailed link and signs out every device', async () => {
    const user = await createUser({ email: 'amina@example.com' });
    const phone = await testClient(app);
    await phone.post('/auth/login', { email: 'amina@example.com', password: TEST_PASSWORD });

    const client = await testClient(app);
    expect(
      (await client.post('/auth/forgot-password', { email: 'amina@example.com' })).status,
    ).toBe(200);
    const token = tokenFromLastEmail();

    const res = await client.post('/auth/reset-password', {
      token,
      password: 'brand-new-password',
    });
    expect(res.status).toBe(200);
    expect((await phone.get('/auth/me')).body.user).toBeNull();

    const login = await client.post('/auth/login', {
      email: 'amina@example.com',
      password: 'brand-new-password',
    });
    expect(login.status).toBe(200);
    expect(
      (await client.post('/auth/reset-password', { token, password: 'another-password' })).status,
    ).toBe(400);
    expect(await auditActions(user.id)).toContain('auth.password_reset');
  });

  it("doesn't reveal whether an email has an account", async () => {
    const client = await testClient(app);
    const res = await client.post('/auth/forgot-password', { email: 'nobody@example.com' });
    expect(res.status).toBe(200);
    expect(testOutbox).toHaveLength(0);
  });

  it('rejects expired links', async () => {
    await createUser({ email: 'amina@example.com' });
    const client = await testClient(app);
    await client.post('/auth/forgot-password', { email: 'amina@example.com' });
    const token = tokenFromLastEmail();
    await prisma.authToken.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });
    expect(
      (await client.post('/auth/reset-password', { token, password: 'brand-new-password' })).status,
    ).toBe(400);
  });
});

describe('rate limiting', () => {
  it('limits repeated login attempts for the same email', async () => {
    const limited = createApp({ rateLimit: true });
    const client = await testClient(limited);
    const attempt = () =>
      client.post('/auth/login', { email: 'target@example.com', password: 'guess' });
    for (let i = 0; i < 10; i++) expect((await attempt()).status).toBe(401);
    const blocked = await attempt();
    expect(blocked.status).toBe(429);
    expect(blocked.body.error.code).toBe('RATE_LIMITED');
  });
});
