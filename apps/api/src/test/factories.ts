import type { Prisma } from '@prisma/client';
import sharp from 'sharp';
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

/** A verified user with a seller profile, ready to list items. */
export async function createSeller(
  countryCode: 'TZ' | 'ZM' = 'TZ',
  overrides: Partial<Prisma.UserUncheckedCreateInput> = {},
) {
  const user = await createUser({ countryCode, ...overrides });
  const region = await prisma.region.findFirstOrThrow({
    where: { country: { code: countryCode } },
  });
  await prisma.sellerProfile.create({
    data: {
      userId: user.id,
      shopName: `${user.name} Shop`,
      slug: `shop-${user.id}`,
      regionId: region.id,
      town: 'Town',
    },
  });
  return { user, region };
}

/** Category ids: a leaf (selectable) and its parent (not selectable). */
export async function categories() {
  const leaf = await prisma.category.findUniqueOrThrow({ where: { slug: 'phones-tablets' } });
  return { leafId: leaf.id, parentId: leaf.parentId! };
}

/** A solid-colour test image. */
export function testImage(width = 800, height = 600, format: 'png' | 'jpeg' = 'png') {
  const img = sharp({ create: { width, height, channels: 3, background: '#0a7' } });
  return (format === 'png' ? img.png() : img.jpeg()).toBuffer();
}
