import type { Prisma } from '@prisma/client';
import { prisma } from '../db.js';
import { hashPassword } from '../modules/auth/auth.service.js';

export const TEST_PASSWORD = 'correct-horse-battery';
let cachedHash: string | undefined;
let counter = 0;

export async function createUser(
  overrides: Partial<Prisma.UserUncheckedCreateInput> & { countryCode?: 'TZ' | 'ZM' } = {},
) {
  const { countryCode = 'TZ', ...data } = overrides;
  const country = await prisma.country.findUniqueOrThrow({ where: { code: countryCode } });
  cachedHash ??= await hashPassword(TEST_PASSWORD);
  counter += 1;
  return prisma.user.create({
    data: {
      email: `user${counter}@example.com`,
      name: `Test User ${counter}`,
      passwordHash: cachedHash,
      countryId: country.id,
      emailVerifiedAt: new Date(),
      consentAt: new Date(),
      ...data,
    },
  });
}

export function auditActions(userId?: number) {
  return prisma.auditLog
    .findMany({ where: userId ? { actorId: userId } : {}, orderBy: { id: 'asc' } })
    .then((rows) => rows.map((r) => r.action));
}

/** Background audit writes are fire-and-forget; give them a moment to land. */
export const settle = () => new Promise((r) => setTimeout(r, 50));
