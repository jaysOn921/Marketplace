import type { AuthTokenType } from '@prisma/client';
import type { Request } from 'express';
import argon2 from 'argon2';
import type { LoginInput, RegisterInput } from '@tzed/shared';
import { loginSchema, registerSchema, resetPasswordSchema } from '@tzed/shared';
import { config } from '../../config.js';
import { prisma } from '../../db.js';
import { AppError } from '../../lib/errors.js';
import { requestLocale } from '../../lib/i18n.js';
import { sendMailInBackground } from '../../lib/mailer.js';
import { hashToken, randomToken } from '../../lib/tokens.js';
import { recordAudit, recordAuditInBackground } from '../audit/audit.service.js';
import { resetPasswordMessage, verifyEmailMessage } from './emails.js';
import { destroyUserSessions } from './session-store.js';
import { startPendingTwoStep, verifyPendingTwoStep } from './two-step.service.js';

const TOKEN_TTL_MS: Record<AuthTokenType, number> = {
  EMAIL_VERIFY: 48 * 60 * 60 * 1000,
  PASSWORD_RESET: 60 * 60 * 1000,
};

// Strong argon2id defaults in real use; cheap settings in tests only, to keep the suite fast.
const HASH_OPTIONS = config.isTest
  ? { type: argon2.argon2id, memoryCost: 1024, timeCost: 2 }
  : { type: argon2.argon2id };

export function hashPassword(password: string) {
  return argon2.hash(password, HASH_OPTIONS);
}

// Used when the email is unknown, so failed logins take the same time either way.
let dummyHash: Promise<string> | undefined;
async function verifyPassword(hash: string | null, password: string) {
  if (!hash) {
    dummyHash ??= hashPassword('not-a-real-password');
    await argon2.verify(await dummyHash, password);
    return false;
  }
  return argon2.verify(hash, password).catch(() => false);
}

async function issueToken(userId: number, type: AuthTokenType) {
  const token = randomToken();
  await prisma.authToken.create({
    data: {
      userId,
      type,
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + TOKEN_TTL_MS[type]),
    },
  });
  return token;
}

async function consumeToken(token: string, type: AuthTokenType) {
  const row = await prisma.authToken.findUnique({ where: { tokenHash: hashToken(token) } });
  if (!row || row.type !== type || row.usedAt || row.expiresAt < new Date()) {
    throw new AppError(
      400,
      'TOKEN_INVALID',
      'This link is invalid or has expired. Please request a new one.',
    );
  }
  // Mark used atomically, so the same link can't be used twice concurrently.
  const { count } = await prisma.authToken.updateMany({
    where: { id: row.id, usedAt: null },
    data: { usedAt: new Date() },
  });
  if (count === 0) throw new AppError(400, 'TOKEN_INVALID', 'This link has already been used.');
  return row;
}

/** Starts a fresh session for the user (prevents session fixation) and returns its CSRF token. */
export function startSession(req: Request, userId: number): Promise<string> {
  return new Promise((resolve, reject) => {
    req.session.regenerate((err) => {
      if (err) return reject(err);
      req.session.userId = userId;
      req.session.csrfToken = randomToken();
      req.session.save((saveErr) => (saveErr ? reject(saveErr) : resolve(req.session.csrfToken!)));
    });
  });
}

export async function register(input: RegisterInput, req: Request) {
  const data = registerSchema.parse(input);
  if (await prisma.user.findUnique({ where: { email: data.email } })) {
    throw AppError.conflict('An account with this email already exists. Try signing in.');
  }
  const country = await prisma.country.findUniqueOrThrow({ where: { code: data.countryCode } });

  const user = await prisma.user.create({
    data: {
      email: data.email,
      name: data.name,
      locale: requestLocale(req),
      phone: data.phone ?? null,
      passwordHash: await hashPassword(data.password),
      countryId: country.id,
      consentAt: new Date(),
      ageConfirmedAt: new Date(),
      marketingOptInAt: data.marketing ? new Date() : null,
    },
  });

  await recordAudit({
    action: 'auth.register',
    actorId: user.id,
    targetType: 'user',
    targetId: user.id,
    req,
  });
  sendMailInBackground(verifyEmailMessage(user, await issueToken(user.id, 'EMAIL_VERIFY')));
  return user;
}

export async function login(input: LoginInput, req: Request) {
  const { email, password } = loginSchema.parse(input);
  const user = await prisma.user.findUnique({ where: { email } });
  const usable = user && user.status !== 'DELETED' ? user : null;

  if (!usable || !(await verifyPassword(usable?.passwordHash ?? null, password))) {
    recordAuditInBackground({
      action: 'auth.login_failed',
      actorId: usable?.id ?? null,
      after: { email },
      req,
    });
    throw new AppError(401, 'INVALID_CREDENTIALS', 'Email or password is incorrect.');
  }

  if (usable.status === 'SUSPENDED') {
    recordAuditInBackground({ action: 'auth.login_blocked', actorId: usable.id, req });
    throw new AppError(
      403,
      'ACCOUNT_SUSPENDED',
      'This account has been suspended. Please contact support if you think this is a mistake.',
    );
  }

  const updates: { lastLoginAt: Date; passwordHash?: string } = { lastLoginAt: new Date() };
  if (argon2.needsRehash(usable.passwordHash, HASH_OPTIONS)) {
    updates.passwordHash = await hashPassword(password);
  }
  if (usable.twoStepEnabledAt) {
    // Password is right, but they aren't signed in until the code step.
    if (updates.passwordHash) {
      await prisma.user.update({
        where: { id: usable.id },
        data: { passwordHash: updates.passwordHash },
      });
    }
    const csrfToken = await startPendingTwoStep(req, usable.id);
    recordAuditInBackground({ action: 'auth.password_ok', actorId: usable.id, req });
    return { userId: null, csrfToken };
  }
  await prisma.user.update({ where: { id: usable.id }, data: updates });

  const csrfToken = await startSession(req, usable.id);
  recordAuditInBackground({ action: 'auth.login', actorId: usable.id, req });
  return { userId: usable.id, csrfToken };
}

/** The second step of signing in: the code from the app, or a backup code. */
export async function loginTwoStep(input: unknown, req: Request) {
  const userId = await verifyPendingTwoStep(req, input);
  await prisma.user.update({ where: { id: userId }, data: { lastLoginAt: new Date() } });
  const csrfToken = await startSession(req, userId);
  recordAuditInBackground({ action: 'auth.login', actorId: userId, req });
  return { userId, csrfToken };
}

export async function logout(req: Request) {
  const userId = req.user?.id;
  await new Promise<void>((resolve, reject) =>
    req.session.destroy((err) => (err ? reject(err) : resolve())),
  );
  if (userId) recordAuditInBackground({ action: 'auth.logout', actorId: userId, req });
}

export async function verifyEmail(token: string, req: Request) {
  const row = await consumeToken(token, 'EMAIL_VERIFY');
  await prisma.user.update({ where: { id: row.userId }, data: { emailVerifiedAt: new Date() } });
  recordAuditInBackground({
    action: 'auth.email_verified',
    actorId: row.userId,
    targetType: 'user',
    targetId: row.userId,
    req,
  });
}

export async function resendVerification(userId: number) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  if (user.emailVerifiedAt) throw AppError.badRequest('Your email is already confirmed.');
  sendMailInBackground(verifyEmailMessage(user, await issueToken(user.id, 'EMAIL_VERIFY')));
}

/** Always succeeds from the caller's point of view, so it can't reveal which emails exist. */
export async function requestPasswordReset(email: string, req: Request) {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || user.status !== 'ACTIVE') return;
  sendMailInBackground(resetPasswordMessage(user, await issueToken(user.id, 'PASSWORD_RESET')));
  recordAuditInBackground({ action: 'auth.password_reset_requested', actorId: user.id, req });
}

export async function resetPassword(input: unknown, req: Request) {
  const { token, password } = resetPasswordSchema.parse(input);
  const row = await consumeToken(token, 'PASSWORD_RESET');
  const user = await prisma.user.findUniqueOrThrow({ where: { id: row.userId } });
  if (user.status !== 'ACTIVE') {
    throw new AppError(400, 'TOKEN_INVALID', 'This link is invalid or has expired.');
  }

  await prisma.$transaction([
    prisma.user.update({
      where: { id: user.id },
      // Receiving the email proves the address works.
      data: {
        passwordHash: await hashPassword(password),
        emailVerifiedAt: user.emailVerifiedAt ?? new Date(),
      },
    }),
    prisma.authToken.updateMany({
      where: { userId: user.id, type: 'PASSWORD_RESET', usedAt: null },
      data: { usedAt: new Date() },
    }),
  ]);
  await destroyUserSessions(user.id);
  await recordAudit({
    action: 'auth.password_reset',
    actorId: user.id,
    targetType: 'user',
    targetId: user.id,
    req,
  });
}
