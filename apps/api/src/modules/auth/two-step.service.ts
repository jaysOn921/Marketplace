import type { Request } from 'express';
import {
  adminReasonSchema,
  twoStepCodeSchema,
  twoStepDisableSchema,
  type TwoStepSetupResponse,
} from '@tzed/shared';
import { prisma } from '../../db.js';
import { config } from '../../config.js';
import { renderEmail } from '../../lib/email-layout.js';
import { AppError } from '../../lib/errors.js';
import { translate, type Locale } from '../../lib/i18n.js';
import { sendMailInBackground } from '../../lib/mailer.js';
import { randomToken } from '../../lib/tokens.js';
import {
  decryptSecret,
  encryptSecret,
  hashBackupCode,
  matchStep,
  newBackupCodes,
  newSecret,
  otpauthUrl,
} from '../../lib/totp.js';
import type { AuthUser } from '../../middleware/auth.js';
import { recordAudit, recordAuditInBackground } from '../audit/audit.service.js';
import { destroyUserSessions } from './session-store.js';

/** How long the code step may take after the password, and how many tries it gets. */
const PENDING_MS = 5 * 60 * 1000;
const MAX_TRIES = 5;

const invalidCode = () =>
  new AppError(400, 'TWO_STEP_INVALID', 'That code is not right. Check the app and try again.', {
    fields: { code: 'That code is not right. Check the app and try again.' },
  });

/** Whether this person must use two-step sign-in (admins, when required). */
export const twoStepRequiredFor = (user: Pick<AuthUser, 'role'>) =>
  config.adminTwoStepRequired && user.role === 'ADMIN';

/** Whether this admin must turn two-step sign-in on before using admin tools. */
export const mustSetUpTwoStep = (user: Pick<AuthUser, 'role' | 'twoStepEnabledAt'>) =>
  twoStepRequiredFor(user) && !user.twoStepEnabledAt;

/**
 * Checks an authenticator code (or an unused backup code) for a user with two-step on.
 * Each authenticator code and each backup code works once.
 */
async function checkCode(userId: number, code: string): Promise<'app' | 'backup' | null> {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  if (!user.twoStepSecret || !user.twoStepEnabledAt) return null;
  const step = matchStep(decryptSecret(user.twoStepSecret), code, user.twoStepLastStep);
  if (step !== null) {
    // Only one request can move twoStepLastStep forward past this step.
    const { count } = await prisma.user.updateMany({
      where: {
        id: userId,
        OR: [{ twoStepLastStep: null }, { twoStepLastStep: { lt: step } }],
      },
      data: { twoStepLastStep: step },
    });
    return count ? 'app' : null;
  }
  const backup = await prisma.twoStepBackupCode.updateMany({
    where: { userId, codeHash: hashBackupCode(code), usedAt: null },
    data: { usedAt: new Date() },
  });
  return backup.count ? 'backup' : null;
}

// ─── Signing in ──────────────────────────────────────────────────────────────

/** After a correct password: remember who is signing in, but don't sign them in yet. */
export function startPendingTwoStep(req: Request, userId: number): Promise<string> {
  return new Promise((resolve, reject) => {
    req.session.regenerate((err) => {
      if (err) return reject(err);
      req.session.twoStep = { userId, startedAt: Date.now(), tries: 0 };
      req.session.csrfToken = randomToken();
      req.session.save((saveErr) => (saveErr ? reject(saveErr) : resolve(req.session.csrfToken!)));
    });
  });
}

/** The second step of signing in. Returns the user id once the code is right. */
export async function verifyPendingTwoStep(req: Request, input: unknown): Promise<number> {
  const { code } = twoStepCodeSchema.parse(input);
  const pending = req.session.twoStep;
  if (!pending || Date.now() - pending.startedAt > PENDING_MS || pending.tries >= MAX_TRIES) {
    delete req.session.twoStep;
    throw new AppError(
      401,
      'TWO_STEP_EXPIRED',
      'Please sign in again: the code step timed out or had too many tries.',
    );
  }
  const used = await checkCode(pending.userId, code);
  if (!used) {
    pending.tries += 1;
    recordAuditInBackground({ action: 'auth.two_step_failed', actorId: pending.userId, req });
    throw invalidCode();
  }
  delete req.session.twoStep;
  recordAuditInBackground({
    action: used === 'backup' ? 'auth.two_step_backup_used' : 'auth.two_step',
    actorId: pending.userId,
    req,
  });
  return pending.userId;
}

// ─── Turning it on and off ───────────────────────────────────────────────────

/** Makes a new key (not active until confirmed with a code from the app). */
export async function beginSetup(user: AuthUser): Promise<TwoStepSetupResponse> {
  if (user.twoStepEnabledAt) throw AppError.conflict('Two-step sign-in is already on.');
  const secret = newSecret();
  await prisma.user.update({
    where: { id: user.id },
    data: { twoStepSecret: encryptSecret(secret), twoStepLastStep: null },
  });
  return { secret, otpauthUrl: otpauthUrl(secret, user.email) };
}

/** Confirms the app works, turns two-step on and returns backup codes (shown once). */
export async function enable(user: AuthUser, input: unknown, req: Request) {
  const { code } = twoStepCodeSchema.parse(input);
  if (user.twoStepEnabledAt) throw AppError.conflict('Two-step sign-in is already on.');
  if (!user.twoStepSecret) throw AppError.badRequest('Start the set-up again.');
  const step = matchStep(decryptSecret(user.twoStepSecret), code, null);
  if (step === null) throw invalidCode();

  const backupCodes = newBackupCodes();
  await prisma.$transaction([
    prisma.twoStepBackupCode.deleteMany({ where: { userId: user.id } }),
    prisma.twoStepBackupCode.createMany({
      data: backupCodes.map((c) => ({ userId: user.id, codeHash: hashBackupCode(c) })),
    }),
    prisma.user.update({
      where: { id: user.id },
      data: { twoStepEnabledAt: new Date(), twoStepLastStep: step },
    }),
  ]);
  await recordAudit({ action: 'user.two_step_on', targetType: 'user', targetId: user.id, req });
  // Other devices signed in with only a password are signed out.
  await destroyUserSessions(user.id, req.sessionID);
  return { backupCodes };
}

/** New backup codes (the old ones stop working). Needs a current code. */
export async function regenerateBackupCodes(user: AuthUser, input: unknown, req: Request) {
  const { code } = twoStepCodeSchema.parse(input);
  if (!(await checkCode(user.id, code))) throw invalidCode();
  const backupCodes = newBackupCodes();
  await prisma.$transaction([
    prisma.twoStepBackupCode.deleteMany({ where: { userId: user.id } }),
    prisma.twoStepBackupCode.createMany({
      data: backupCodes.map((c) => ({ userId: user.id, codeHash: hashBackupCode(c) })),
    }),
  ]);
  await recordAudit({
    action: 'user.two_step_new_codes',
    targetType: 'user',
    targetId: user.id,
    req,
  });
  return { backupCodes };
}

const clearTwoStep = {
  twoStepSecret: null,
  twoStepEnabledAt: null,
  twoStepLastStep: null,
} as const;

/** Turns it off, with the password and a current code. Admins can't while it's required. */
export async function disable(
  user: AuthUser,
  input: unknown,
  req: Request,
  checkPassword: (user: AuthUser, password: string) => Promise<void>,
) {
  const { password, code } = twoStepDisableSchema.parse(input);
  if (twoStepRequiredFor(user)) {
    throw AppError.conflict('Admins must keep two-step sign-in on.');
  }
  await checkPassword(user, password);
  if (!(await checkCode(user.id, code))) throw invalidCode();
  await prisma.$transaction([
    prisma.twoStepBackupCode.deleteMany({ where: { userId: user.id } }),
    prisma.user.update({ where: { id: user.id }, data: clearTwoStep }),
  ]);
  await recordAudit({ action: 'user.two_step_off', targetType: 'user', targetId: user.id, req });
}

/** For someone who lost their phone and backup codes: an admin turns it off for them. */
export async function adminReset(admin: AuthUser, userId: number, input: unknown, req: Request) {
  const { reason } = adminReasonSchema.parse(input);
  if (userId === admin.id) throw AppError.badRequest("You can't change your own account here.");
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || user.status === 'DELETED') throw AppError.notFound('User not found.');
  if (!user.twoStepEnabledAt) throw AppError.conflict('Two-step sign-in is not on for this user.');
  await prisma.$transaction(async (tx) => {
    await tx.twoStepBackupCode.deleteMany({ where: { userId } });
    await tx.user.update({ where: { id: userId }, data: clearTwoStep });
    await recordAudit(
      {
        action: 'user.two_step_reset',
        targetType: 'user',
        targetId: userId,
        after: { reason },
        req,
      },
      tx,
    );
  });
  await destroyUserSessions(userId);
  const locale = user.locale as Locale;
  sendMailInBackground({
    to: user.email,
    subject: translate('Two-step sign-in was turned off', locale),
    ...renderEmail({
      locale,
      name: user.name,
      paragraphs: [
        'The TZed team turned off two-step sign-in on your account, as you asked.',
        `Reason: ${reason}`,
        "Sign in with your password and turn it on again from My account. If you didn't ask for this, contact support straight away.",
      ],
      action: { label: 'Sign in', path: '/login' },
    }),
  });
}
