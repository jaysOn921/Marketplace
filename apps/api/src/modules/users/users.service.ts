import type { Request } from 'express';
import type { Prisma } from '@prisma/client';
import argon2 from 'argon2';
import {
  changePasswordSchema,
  deleteAccountSchema,
  marketingPreferenceSchema,
  phoneSharingSchema,
  sellerProfileSchema,
  updateProfileSchema,
} from '@tzed/shared';
import { prisma } from '../../db.js';
import { AppError } from '../../lib/errors.js';
import { slugify } from '../../lib/slug.js';
import type { AuthUser } from '../../middleware/auth.js';
import { recordAudit } from '../audit/audit.service.js';
import { hashPassword } from '../auth/auth.service.js';
import { destroyUserSessions } from '../auth/session-store.js';

export async function checkPassword(user: AuthUser, password: string) {
  if (!(await argon2.verify(user.passwordHash, password).catch(() => false))) {
    throw new AppError(400, 'WRONG_PASSWORD', 'That password is incorrect.', {
      fields: { password: 'That password is incorrect.' },
    });
  }
}

export async function updateProfile(user: AuthUser, input: unknown, req: Request) {
  const data = updateProfileSchema.parse(input);
  const changingCountry = data.countryCode !== user.country.code;

  if (changingCountry) {
    // Listings are priced in the seller's currency, so the country is fixed once they sell.
    if (await prisma.listing.count({ where: { sellerId: user.id } })) {
      throw AppError.conflict(
        "You can't change your country after creating listings. Contact support if you've moved.",
      );
    }
  }
  const country = await prisma.country.findUniqueOrThrow({ where: { code: data.countryCode } });

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: user.id },
      data: { name: data.name, phone: data.phone ?? null, countryId: country.id },
    });
    if (changingCountry) {
      // The old region belongs to the old country.
      await tx.sellerProfile.updateMany({ where: { userId: user.id }, data: { regionId: null } });
      await recordAudit(
        {
          action: 'user.country_change',
          targetType: 'user',
          targetId: user.id,
          before: { country: user.country.code },
          after: { country: data.countryCode },
          req,
        },
        tx,
      );
    }
  });
}

export async function changePassword(user: AuthUser, input: unknown, req: Request) {
  const { currentPassword, newPassword } = changePasswordSchema.parse(input);
  await checkPassword(user, currentPassword).catch(() => {
    throw new AppError(400, 'WRONG_PASSWORD', 'Your current password is incorrect.', {
      fields: { currentPassword: 'Your current password is incorrect.' },
    });
  });
  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: await hashPassword(newPassword) },
  });
  // Sign out other devices, keep this one.
  await destroyUserSessions(user.id, req.sessionID);
  await recordAudit({ action: 'auth.password_change', targetType: 'user', targetId: user.id, req });
}

async function uniqueSlug(base: string) {
  const slug = slugify(base);
  for (let i = 1; ; i++) {
    const candidate = i === 1 ? slug : `${slug}-${i}`;
    if (!(await prisma.sellerProfile.findUnique({ where: { slug: candidate } }))) return candidate;
  }
}

export async function upsertSellerProfile(user: AuthUser, input: unknown) {
  const data = sellerProfileSchema.parse(input);
  const region = await prisma.region.findUnique({ where: { id: data.regionId } });
  if (!region || region.countryId !== user.countryId) {
    throw AppError.badRequest('Choose a region or province in your country.', {
      fields: { regionId: 'Choose a region or province in your country.' },
    });
  }

  // The shop link (slug) is set once and stays stable even if the shop is renamed.
  await prisma.sellerProfile.upsert({
    where: { userId: user.id },
    update: data,
    create: { ...data, userId: user.id, slug: await uniqueSlug(data.shopName) },
  });
}

/** Everything we hold about the user, for the data-export right in TZ and ZM data protection law. */
export async function exportData(user: AuthUser, req: Request) {
  const id = user.id;
  const [
    profile,
    listings,
    ordersAsBuyer,
    ordersAsSeller,
    reviewsWritten,
    reviewsReceived,
    conversations,
    notifications,
    tickets,
    reports,
    cart,
    saved,
    problems,
  ] = await Promise.all([
    prisma.user.findUniqueOrThrow({
      where: { id },
      select: {
        id: true,
        email: true,
        name: true,
        phone: true,
        role: true,
        status: true,
        emailVerifiedAt: true,
        consentAt: true,
        ageConfirmedAt: true,
        marketingOptInAt: true,
        sharePhoneOnOrders: true,
        twoStepEnabledAt: true,
        locale: true,
        lastLoginAt: true,
        lastActiveAt: true,
        createdAt: true,
        country: { select: { code: true, name: true } },
        sellerProfile: { include: { region: { select: { name: true } } } },
      },
    }),
    prisma.listing.findMany({ where: { sellerId: id }, include: { images: true, shipTo: true } }),
    prisma.order.findMany({ where: { buyerId: id }, include: { items: true, events: true } }),
    prisma.order.findMany({ where: { sellerId: id }, include: { items: true, events: true } }),
    prisma.review.findMany({ where: { reviewerId: id } }),
    prisma.review.findMany({ where: { sellerId: id } }),
    prisma.conversation.findMany({
      where: { OR: [{ buyerId: id }, { sellerId: id }] },
      include: { messages: { where: { senderId: id } } },
    }),
    prisma.notification.findMany({ where: { userId: id } }),
    prisma.supportTicket.findMany({ where: { userId: id }, include: { messages: true } }),
    prisma.report.findMany({ where: { reporterId: id } }),
    prisma.cartItem.findMany({
      where: { userId: id },
      select: { listingId: true, quantity: true, createdAt: true },
    }),
    prisma.savedListing.findMany({
      where: { userId: id },
      select: { listingId: true, createdAt: true },
    }),
    // Problems on their orders, with only the messages they wrote.
    prisma.orderDispute.findMany({
      where: { order: { OR: [{ buyerId: id }, { sellerId: id }] } },
      include: { messages: { where: { authorId: id } } },
    }),
  ]);

  await recordAudit({ action: 'user.data_export', targetType: 'user', targetId: id, req });
  return {
    exportedAt: new Date().toISOString(),
    profile,
    listings,
    ordersAsBuyer,
    ordersAsSeller,
    reviewsWritten,
    reviewsReceived,
    conversations: conversations.map((c) => ({
      ...c,
      messagesYouSent: c.messages,
      messages: undefined,
    })),
    notifications,
    supportTickets: tickets,
    reportsFiled: reports,
    cart,
    savedItems: saved,
    orderProblems: problems.map((p) => ({
      ...p,
      messagesYouSent: p.messages,
      messages: undefined,
    })),
  };
}

/**
 * Deletes the account by removing personal data. Orders, messages and reviews stay
 * (shown as "Deleted user") because the other party needs them for their own records.
 */
/** Turns news and offers by email on or off, recording when and from where. */
export async function setMarketing(user: AuthUser, input: unknown, req: Request) {
  const { marketing } = marketingPreferenceSchema.parse(input);
  if (marketing === (user.marketingOptInAt !== null)) return;
  await prisma.user.update({
    where: { id: user.id },
    data: { marketingOptInAt: marketing ? new Date() : null },
  });
  await recordAudit({
    action: marketing ? 'user.marketing_opt_in' : 'user.marketing_opt_out',
    targetType: 'user',
    targetId: user.id,
    req,
  });
}

/** Whether sellers see this buyer's phone number once they accept an order. */
export async function setPhoneSharing(user: AuthUser, input: unknown, req: Request) {
  const { share } = phoneSharingSchema.parse(input);
  if (share === user.sharePhoneOnOrders) return;
  await prisma.user.update({ where: { id: user.id }, data: { sharePhoneOnOrders: share } });
  await recordAudit({
    action: share ? 'user.phone_sharing_on' : 'user.phone_sharing_off',
    targetType: 'user',
    targetId: user.id,
    req,
  });
}

export async function deleteAccount(user: AuthUser, input: unknown, req: Request) {
  const { password } = deleteAccountSchema.parse(input);
  await checkPassword(user, password);

  await prisma.$transaction(async (tx) => {
    await anonymiseUser(tx, user.id);
    await recordAudit({ action: 'user.delete', targetType: 'user', targetId: user.id, req }, tx);
  });
  await destroyUserSessions(user.id);
}

/** Removes a person's personal data, keeping orders, messages and reviews as "Deleted user". */
export async function anonymiseUser(tx: Prisma.TransactionClient, userId: number) {
  await tx.listing.updateMany({
    where: {
      sellerId: userId,
      status: { in: ['DRAFT', 'PENDING_REVIEW', 'ACTIVE', 'REJECTED'] },
    },
    data: { status: 'REMOVED' },
  });
  await tx.sellerProfile.deleteMany({ where: { userId } });
  await tx.authToken.deleteMany({ where: { userId } });
  await tx.notification.deleteMany({ where: { userId } });
  await tx.cartItem.deleteMany({ where: { userId } });
  await tx.savedListing.deleteMany({ where: { userId } });
  await tx.twoStepBackupCode.deleteMany({ where: { userId } });
  await tx.user.update({
    where: { id: userId },
    data: {
      status: 'DELETED',
      email: `deleted-${userId}@deleted.invalid`,
      name: 'Deleted user',
      phone: null,
      passwordHash: '!',
      emailVerifiedAt: null,
      marketingOptInAt: null,
      sharePhoneOnOrders: false,
      twoStepSecret: null,
      twoStepEnabledAt: null,
      twoStepLastStep: null,
      lastActiveAt: null,
      dormantWarnedAt: null,
    },
  });
}
