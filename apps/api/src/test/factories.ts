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

/** A live listing for a seller, with sensible defaults. */
export async function createListing(
  seller: { id: number; countryId: number },
  overrides: Partial<Prisma.ListingUncheckedCreateInput> & { crossBorder?: boolean } = {},
) {
  const { crossBorder = false, ...data } = overrides;
  const country = await prisma.country.findUniqueOrThrow({ where: { id: seller.countryId } });
  const other = await prisma.country.findFirstOrThrow({ where: { id: { not: seller.countryId } } });
  const region = await prisma.region.findFirstOrThrow({ where: { countryId: seller.countryId } });
  const category = await prisma.category.findUniqueOrThrow({ where: { slug: 'phones-tablets' } });
  return prisma.listing.create({
    data: {
      sellerId: seller.id,
      categoryId: category.id,
      title: 'Samsung Galaxy A15',
      description: 'Brand new in box with charger.',
      price: country.code === 'TZ' ? '380000' : '3500',
      currency: country.currencyCode,
      condition: 'NEW',
      quantity: 3,
      countryId: seller.countryId,
      regionId: region.id,
      town: 'Town',
      deliveryPickup: true,
      deliveryLocal: true,
      deliveryCrossBorder: crossBorder,
      status: 'ACTIVE',
      publishedAt: new Date(),
      shipTo: {
        create: [
          { countryId: seller.countryId },
          ...(crossBorder ? [{ countryId: other.id }] : []),
        ],
      },
      ...data,
    },
  });
}
