import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { seedReferenceData } from '../../../prisma/seed.js';
import { createApp } from '../../app.js';
import { config } from '../../config.js';
import { prisma } from '../../db.js';
import { testOutbox } from '../../lib/mailer.js';
import { codeAt, decryptSecret, encryptSecret, matchStep, timeStep } from '../../lib/totp.js';
import { testClient } from '../../test/client.js';
import { resetDb } from '../../test/db.js';
import { auditActions, createUser, TEST_PASSWORD } from '../../test/factories.js';

const app = createApp();

beforeEach(async () => {
  await resetDb();
  await seedReferenceData(prisma);
  testOutbox.length = 0;
});
afterEach(() => {
  config.adminTwoStepRequired = false;
});

describe('authenticator codes', () => {
  it('matches the RFC 6238 test vector', () => {
    // "12345678901234567890" in base32; at 59 seconds the 8-digit code is 94287082.
    expect(codeAt('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ', timeStep(59_000))).toBe('287082');
  });

  it('allows one step of clock drift, and each code once', () => {
    const secret = 'JBSWY3DPEHPK3PXP';
    const now = Date.now();
    const step = timeStep(now);
    expect(matchStep(secret, codeAt(secret, step - 1), null, now)).toBe(step - 1);
    expect(matchStep(secret, codeAt(secret, step + 2), null, now)).toBeNull();
    expect(matchStep(secret, codeAt(secret, step), step, now)).toBeNull();
    expect(matchStep(secret, 'abcdef', null, now)).toBeNull();
  });

  it('stores keys encrypted', () => {
    const stored = encryptSecret('JBSWY3DPEHPK3PXP');
    expect(stored).not.toContain('JBSWY3DPEHPK3PXP');
    expect(decryptSecret(stored)).toBe('JBSWY3DPEHPK3PXP');
  });
});

async function signIn(email: string) {
  const client = await testClient(app);
  const res = await client.post('/auth/login', { email, password: TEST_PASSWORD });
  return { client, res };
}

/** Turns two-step on for a signed-in client; returns the key and backup codes. */
async function turnOn(client: Awaited<ReturnType<typeof testClient>>) {
  const setup = await client.post('/me/two-step/setup');
  expect(setup.body.otpauthUrl).toMatch(/^otpauth:\/\/totp\/TZed:/);
  const secret = setup.body.secret as string;
  // The code for the step before now, so the sign-in below can use the current one.
  const enabled = await client.post('/me/two-step/enable', {
    code: codeAt(secret, timeStep() - 1),
  });
  expect(enabled.status).toBe(200);
  expect(enabled.body.user.twoStepEnabled).toBe(true);
  return { secret, backupCodes: enabled.body.backupCodes as string[] };
}

describe('two-step sign-in', () => {
  it('asks for a code after the password, and signs in only with a right one', async () => {
    const user = await createUser({ role: 'ADMIN' });
    const { client } = await signIn(user.email);
    expect((await client.post('/me/two-step/enable', { code: '000000' })).status).toBe(400);
    const { secret, backupCodes } = await turnOn(client);
    expect(backupCodes).toHaveLength(10);
    const stored = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(stored.twoStepSecret).not.toContain(secret);

    const { client: next, res } = await signIn(user.email);
    expect(res.body).toMatchObject({ user: null, twoStepRequired: true });
    expect((await next.get('/auth/me')).body.user).toBeNull();
    expect((await next.get('/admin/users')).status).toBe(401);

    const wrong = await next.post('/auth/login/two-step', { code: '000000' });
    expect(wrong.status).toBe(400);
    expect(wrong.body.error.details.fields.code).toMatch(/not right/);

    const code = codeAt(secret, timeStep());
    const ok = await next.post('/auth/login/two-step', { code });
    expect(ok.status).toBe(200);
    expect(ok.body.user).toMatchObject({ id: user.id, twoStepEnabled: true });
    expect((await next.get('/admin/users')).status).toBe(200);

    // The same code can't be used again.
    const { client: again } = await signIn(user.email);
    expect((await again.post('/auth/login/two-step', { code })).status).toBe(400);
    expect(await auditActions(user.id)).toEqual(
      expect.arrayContaining(['user.two_step_on', 'auth.two_step', 'auth.two_step_failed']),
    );
  });

  it('accepts each backup code once', async () => {
    const user = await createUser();
    const { client } = await signIn(user.email);
    const { backupCodes } = await turnOn(client);

    const first = await signIn(user.email);
    expect(
      (await first.client.post('/auth/login/two-step', { code: backupCodes[0]!.toUpperCase() }))
        .status,
    ).toBe(200);
    const second = await signIn(user.email);
    expect(
      (await second.client.post('/auth/login/two-step', { code: backupCodes[0] })).status,
    ).toBe(400);
    expect(await auditActions(user.id)).toContain('auth.two_step_backup_used');
  });

  it('gives up after five wrong codes', async () => {
    const user = await createUser();
    const { client } = await signIn(user.email);
    const { secret } = await turnOn(client);
    const { client: next } = await signIn(user.email);
    for (let i = 0; i < 5; i++) await next.post('/auth/login/two-step', { code: '000000' });
    const late = await next.post('/auth/login/two-step', { code: codeAt(secret, timeStep()) });
    expect(late.status).toBe(401);
    expect(late.body.error.code).toBe('TWO_STEP_EXPIRED');
  });

  it('signs out other devices when turned on', async () => {
    const user = await createUser();
    const { client: phone } = await signIn(user.email);
    const { client: laptop } = await signIn(user.email);
    await turnOn(laptop);
    expect((await phone.get('/auth/me')).body.user).toBeNull();
    expect((await laptop.get('/auth/me')).body.user.id).toBe(user.id);
  });

  it('turns off with the password and a code, but not for admins while required', async () => {
    const user = await createUser();
    const { client } = await signIn(user.email);
    const { secret } = await turnOn(client);
    expect(
      (
        await client.post('/me/two-step/disable', {
          password: 'wrong-password',
          code: codeAt(secret, timeStep()),
        })
      ).status,
    ).toBe(400);
    const off = await client.post('/me/two-step/disable', {
      password: TEST_PASSWORD,
      code: codeAt(secret, timeStep()),
    });
    expect(off.body.user.twoStepEnabled).toBe(false);
    expect((await signIn(user.email)).res.body.user.id).toBe(user.id);

    config.adminTwoStepRequired = true;
    const admin = await createUser({ role: 'ADMIN' });
    const a = (await signIn(admin.email)).client;
    const { secret: adminSecret } = await turnOn(a);
    const refused = await a.post('/me/two-step/disable', {
      password: TEST_PASSWORD,
      code: codeAt(adminSecret, timeStep()),
    });
    expect(refused.status).toBe(409);
  });
});

describe('required for admins', () => {
  it('keeps admins out of admin tools until they turn it on', async () => {
    config.adminTwoStepRequired = true;
    const admin = await createUser({ role: 'ADMIN' });
    const { client, res } = await signIn(admin.email);
    expect(res.body.user).toMatchObject({ twoStepRequired: true, twoStepEnabled: false });
    const blocked = await client.get('/admin/users');
    expect(blocked.status).toBe(403);
    expect(blocked.body.error.code).toBe('TWO_STEP_SETUP_REQUIRED');

    await turnOn(client);
    expect((await client.get('/auth/me')).body.user.twoStepEnabled).toBe(true);
    expect((await client.get('/admin/users')).status).toBe(200);
  });

  it('lets another admin reset it for someone who lost their phone', async () => {
    const user = await createUser({ name: 'Joseph Banda' });
    const { client } = await signIn(user.email);
    await turnOn(client);
    const admin = (await signIn((await createUser({ role: 'ADMIN' })).email)).client;
    expect(
      (await admin.get('/admin/users')).body.rows.find((r: { id: number }) => r.id === user.id)
        .twoStepEnabled,
    ).toBe(true);

    const reset = await admin.post(`/admin/users/${user.id}/reset-two-step`, {
      reason: 'Lost their phone; identity checked by phone call.',
    });
    expect(reset.status).toBe(200);
    expect((await client.get('/auth/me')).body.user).toBeNull(); // signed out everywhere
    expect((await signIn(user.email)).res.body.user.id).toBe(user.id);
    expect(testOutbox.at(-1)).toMatchObject({
      to: user.email,
      subject: 'Two-step sign-in was turned off',
    });
    expect(
      (
        await admin.post(`/admin/users/${user.id}/reset-two-step`, {
          reason: 'Resetting it a second time.',
        })
      ).status,
    ).toBe(409);
  });
});
