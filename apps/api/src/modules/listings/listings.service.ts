import type { Prisma } from '@prisma/client';
import type { Request } from 'express';
import {
  CURRENCIES,
  DELIVERY_REQUIRED_MESSAGE,
  MAX_LISTING_IMAGES,
  imageOrderSchema,
  isCurrencyCode,
  listingCreateSchema,
  listingUpdateSchema,
  needsDelivery,
  roundMoney,
  type CurrencyCode,
  type ListingStatus,
} from '@tzed/shared';
import { prisma } from '../../db.js';
import { AppError } from '../../lib/errors.js';
import type { AuthUser } from '../../middleware/auth.js';
import { processAndStoreImage, removeImage, type StoredImage } from '../media/images.js';
import { storage } from '../media/storage.js';
import { listingDetailInclude } from './listing-dto.js';

/** Statuses the public can see. Everything else is visible to the owner and admins only. */
export const PUBLIC_STATUSES: ListingStatus[] = ['ACTIVE', 'SOLD'];

/** Fields whose change sends a live listing back to the admins for review. */
const REVIEWED_FIELDS = ['title', 'description', 'price', 'categoryId'] as const;

function requireSeller(user: AuthUser) {
  if (!user.emailVerifiedAt) {
    throw new AppError(
      403,
      'EMAIL_NOT_VERIFIED',
      'Please confirm your email address before listing items.',
    );
  }
  if (!user.sellerProfile) {
    throw new AppError(
      403,
      'NO_SELLER_PROFILE',
      'Set up your seller profile before listing items.',
    );
  }
}

async function checkCategory(categoryId: number) {
  const category = await prisma.category.findUnique({
    where: { id: categoryId },
    include: { children: { where: { isActive: true }, select: { id: true } } },
  });
  if (!category || !category.isActive) {
    throw AppError.badRequest('Choose a category.', {
      fields: { categoryId: 'Choose a category.' },
    });
  }
  if (category.children.length) {
    const message = 'Choose a more specific category.';
    throw AppError.badRequest(message, { fields: { categoryId: message } });
  }
}

async function checkRegion(regionId: number, countryId: number) {
  const region = await prisma.region.findUnique({ where: { id: regionId } });
  if (!region || region.countryId !== countryId) {
    const message = 'Choose a region or province in your country.';
    throw AppError.badRequest(message, { fields: { regionId: message } });
  }
}

/** Prices follow the currency's minor units: whole shillings, kwacha with ngwee. */
function normalisePrice(price: number, currency: string) {
  if (!isCurrencyCode(currency)) throw new Error(`Unknown currency ${currency}`);
  const rounded = roundMoney(price, currency);
  if (rounded <= 0) {
    const message = `Enter a price of at least ${CURRENCIES[currency].symbol} 1.`;
    throw AppError.badRequest(message, { fields: { price: message } });
  }
  return rounded.toFixed(CURRENCIES[currency].minorUnits);
}

async function otherCountryId(countryId: number) {
  const other = await prisma.country.findFirst({ where: { id: { not: countryId } } });
  return other?.id;
}

async function shipToRows(countryId: number, crossBorder: boolean) {
  const other = crossBorder ? await otherCountryId(countryId) : undefined;
  return [{ countryId }, ...(other ? [{ countryId: other }] : [])];
}

/** Loads a listing and checks the current user owns it. */
export async function getOwnListing(user: AuthUser, id: number) {
  const listing = await prisma.listing.findUnique({ where: { id }, include: listingDetailInclude });
  if (!listing || listing.status === 'REMOVED') throw AppError.notFound('Listing not found.');
  if (listing.sellerId !== user.id) throw AppError.forbidden('This is not your listing.');
  return listing;
}

export async function createListing(user: AuthUser, input: unknown) {
  requireSeller(user);
  const data = listingCreateSchema.parse(input);
  await checkCategory(data.categoryId);
  await checkRegion(data.regionId, user.countryId);
  const currency = user.country.currencyCode;

  return prisma.listing.create({
    data: {
      sellerId: user.id,
      categoryId: data.categoryId,
      title: data.title,
      description: data.description,
      price: normalisePrice(data.price, currency),
      currency, // always the seller's own currency
      condition: data.condition,
      quantity: data.quantity,
      countryId: user.countryId,
      regionId: data.regionId,
      town: data.town,
      deliveryPickup: data.deliveryPickup,
      deliveryLocal: data.deliveryLocal,
      deliveryCrossBorder: data.crossBorder,
      deliveryNotes: data.deliveryNotes,
      status: 'DRAFT',
      shipTo: { create: await shipToRows(user.countryId, data.crossBorder) },
    },
    include: listingDetailInclude,
  });
}

/** Moves a live listing back into the review queue after a content change. */
async function sendBackForReview(
  tx: Prisma.TransactionClient,
  listingId: number,
  userId: number,
  reason: string,
) {
  await tx.listing.update({
    where: { id: listingId },
    data: { status: 'PENDING_REVIEW', submittedAt: new Date() },
  });
  await tx.listingReviewEvent.create({
    data: { listingId, actorId: userId, decision: 'SUBMITTED', reason },
  });
}

export async function updateListing(user: AuthUser, id: number, input: unknown) {
  const listing = await getOwnListing(user, id);
  const data = listingUpdateSchema.parse(input);

  if (data.categoryId !== undefined) await checkCategory(data.categoryId);
  if (data.regionId !== undefined) await checkRegion(data.regionId, listing.countryId);
  const price = data.price !== undefined ? normalisePrice(data.price, listing.currency) : undefined;

  const delivery = {
    deliveryPickup: data.deliveryPickup ?? listing.deliveryPickup,
    deliveryLocal: data.deliveryLocal ?? listing.deliveryLocal,
    crossBorder: data.crossBorder ?? listing.deliveryCrossBorder,
  };
  if (!needsDelivery(delivery)) {
    throw AppError.badRequest(DELIVERY_REQUIRED_MESSAGE, {
      fields: { deliveryPickup: DELIVERY_REQUIRED_MESSAGE },
    });
  }

  const contentChanged = REVIEWED_FIELDS.some((field) => {
    if (data[field] === undefined) return false;
    if (field === 'price')
      return (
        price !== listing.price.toFixed(CURRENCIES[listing.currency as CurrencyCode].minorUnits)
      );
    return data[field] !== listing[field];
  });
  const sentForReview = contentChanged && listing.status === 'ACTIVE';

  // Quantity back above zero relists a sold item; quantity 0 isn't allowed by the schema.
  const relist = listing.status === 'SOLD' && data.quantity !== undefined && !sentForReview;

  await prisma.$transaction(async (tx) => {
    await tx.listing.update({
      where: { id },
      data: {
        title: data.title,
        description: data.description,
        categoryId: data.categoryId,
        price,
        condition: data.condition,
        quantity: data.quantity,
        regionId: data.regionId,
        town: data.town,
        deliveryPickup: data.deliveryPickup,
        deliveryLocal: data.deliveryLocal,
        deliveryCrossBorder: data.crossBorder,
        deliveryNotes: data.deliveryNotes,
        ...(relist ? { status: 'ACTIVE' as const } : {}),
      },
    });
    if (data.crossBorder !== undefined && data.crossBorder !== listing.deliveryCrossBorder) {
      await tx.listingShipTo.deleteMany({ where: { listingId: id } });
      await tx.listingShipTo.createMany({
        data: (await shipToRows(listing.countryId, data.crossBorder)).map((r) => ({
          ...r,
          listingId: id,
        })),
      });
    }
    if (sentForReview) await sendBackForReview(tx, id, user.id, 'Edited after approval');
  });

  return { listing: await getOwnListing(user, id), sentForReview };
}

export async function submitForReview(user: AuthUser, id: number) {
  requireSeller(user);
  const listing = await getOwnListing(user, id);
  if (!['DRAFT', 'REJECTED'].includes(listing.status)) {
    throw AppError.conflict('Only drafts and rejected listings can be submitted for review.');
  }
  if (listing.images.length === 0) {
    throw AppError.badRequest('Add at least one photo before submitting.');
  }
  await prisma.$transaction([
    prisma.listing.update({
      where: { id },
      data: { status: 'PENDING_REVIEW', submittedAt: new Date() },
    }),
    prisma.listingReviewEvent.create({
      data: {
        listingId: id,
        actorId: user.id,
        decision: 'SUBMITTED',
        reason: listing.status === 'REJECTED' ? 'Resubmitted after changes' : null,
      },
    }),
  ]);
  return getOwnListing(user, id);
}

export async function setSold(user: AuthUser, id: number, sold: boolean) {
  const listing = await getOwnListing(user, id);
  if (sold && listing.status !== 'ACTIVE')
    throw AppError.conflict('Only live listings can be marked as sold.');
  if (!sold && listing.status !== 'SOLD')
    throw AppError.conflict('This listing is not marked as sold.');
  await prisma.listing.update({
    where: { id },
    data: sold ? { status: 'SOLD' } : { status: 'ACTIVE', quantity: Math.max(listing.quantity, 1) },
  });
  return getOwnListing(user, id);
}

/** Deletes a listing. Listings that were ordered are kept (hidden) for the order history. */
export async function deleteListing(user: AuthUser, id: number) {
  const listing = await getOwnListing(user, id);
  const ordered = await prisma.orderItem.count({ where: { listingId: id } });
  if (ordered > 0) {
    await prisma.listing.update({ where: { id }, data: { status: 'REMOVED' } });
    return;
  }
  await prisma.listing.delete({ where: { id } });
  await storage.removePrefix(`listings/${listing.id}`);
}

export async function addImages(user: AuthUser, id: number, files: Express.Multer.File[]) {
  const listing = await getOwnListing(user, id);
  if (files.length === 0) throw AppError.badRequest('Choose at least one photo.');
  if (listing.images.length + files.length > MAX_LISTING_IMAGES) {
    throw AppError.badRequest(`A listing can have at most ${MAX_LISTING_IMAGES} photos.`);
  }

  const stored: StoredImage[] = [];
  try {
    for (const file of files)
      stored.push(await processAndStoreImage(file.buffer, `listings/${id}`));
  } catch (err) {
    await Promise.all(stored.map((s) => removeImage(s.storageKey)));
    throw err;
  }

  const start = listing.images.length;
  const sentForReview = listing.status === 'ACTIVE';
  await prisma.$transaction(async (tx) => {
    await tx.listingImage.createMany({
      data: stored.map((s, i) => ({ listingId: id, ...s, sortOrder: start + i })),
    });
    // New photos on a live listing need to be checked too.
    if (sentForReview) await sendBackForReview(tx, id, user.id, 'New photos added after approval');
  });
  return { listing: await getOwnListing(user, id), sentForReview };
}

export async function deleteImage(user: AuthUser, id: number, imageId: number) {
  const listing = await getOwnListing(user, id);
  const image = listing.images.find((i) => i.id === imageId);
  if (!image) throw AppError.notFound('Photo not found.');
  if (listing.images.length === 1 && listing.status !== 'DRAFT') {
    throw AppError.badRequest(
      'A listing needs at least one photo. Add another before removing this one.',
    );
  }
  await prisma.listingImage.delete({ where: { id: imageId } });
  await removeImage(image.storageKey);
  return getOwnListing(user, id);
}

/** Reorders photos; the first one is the cover photo. */
export async function reorderImages(user: AuthUser, id: number, input: unknown) {
  const listing = await getOwnListing(user, id);
  const { imageIds } = imageOrderSchema.parse(input);
  const current = listing.images.map((i) => i.id).sort((a, b) => a - b);
  if ([...imageIds].sort((a, b) => a - b).join() !== current.join()) {
    throw AppError.badRequest('The photo list is out of date. Please refresh and try again.');
  }
  await prisma.$transaction(
    imageIds.map((imageId, sortOrder) =>
      prisma.listingImage.update({ where: { id: imageId }, data: { sortOrder } }),
    ),
  );
  return getOwnListing(user, id);
}

/** A listing as seen by `viewer` (public listings for everyone, others for owner/admin). */
export async function getVisibleListing(id: number, req: Request) {
  const listing = await prisma.listing.findUnique({ where: { id }, include: listingDetailInclude });
  const viewer = req.user;
  const visible =
    listing &&
    (PUBLIC_STATUSES.includes(listing.status) ||
      (listing.status !== 'REMOVED' && viewer?.id === listing.sellerId) ||
      viewer?.role === 'ADMIN');
  if (!listing || !visible) throw AppError.notFound('This listing is not available.');
  return listing;
}
