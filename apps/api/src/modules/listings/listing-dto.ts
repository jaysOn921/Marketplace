import type { Prisma } from '@prisma/client';
import type {
  CountryCode,
  CurrencyCode,
  ListingDetail,
  ListingImageDto,
  ListingSummary,
} from '@tzed/shared';
import { imageKeys } from '../media/images.js';
import { storage } from '../media/storage.js';

export const listingSummaryInclude = {
  country: true,
  region: true,
  images: { orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }], take: 1 },
} satisfies Prisma.ListingInclude;

export const listingDetailInclude = {
  country: true,
  region: true,
  images: { orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] },
  category: { include: { parent: true } },
  shipTo: { include: { country: true } },
  seller: { include: { country: true, sellerProfile: { include: { region: true } } } },
} satisfies Prisma.ListingInclude;

type SummaryRow = Prisma.ListingGetPayload<{ include: typeof listingSummaryInclude }>;
type DetailRow = Prisma.ListingGetPayload<{ include: typeof listingDetailInclude }>;
type ImageRow = SummaryRow['images'][number];

export function toImageDto(img: ImageRow): ListingImageDto {
  const keys = imageKeys(img.storageKey);
  return {
    id: img.id,
    url: storage.publicUrl(keys.full),
    thumbUrl: storage.publicUrl(keys.thumb),
    width: img.width,
    height: img.height,
  };
}

export function toListingSummary(l: SummaryRow): ListingSummary {
  return {
    id: l.id,
    title: l.title,
    price: l.price.toNumber(),
    currency: l.currency as CurrencyCode,
    condition: l.condition,
    status: l.status,
    quantity: l.quantity,
    countryCode: l.country.code as CountryCode,
    regionName: l.region.name,
    town: l.town,
    crossBorder: l.deliveryCrossBorder,
    coverImage: l.images[0] ? toImageDto(l.images[0]) : null,
    createdAt: l.createdAt.toISOString(),
    publishedAt: l.publishedAt?.toISOString() ?? null,
  };
}

export function toListingDetail(
  l: DetailRow,
  viewer?: { id: number; role: string },
): ListingDetail {
  const isOwner = viewer?.id === l.sellerId;
  const canSeeModeration = isOwner || viewer?.role === 'ADMIN';
  const sp = l.seller.sellerProfile;
  return {
    ...toListingSummary(l),
    description: l.description,
    categoryId: l.categoryId,
    category: {
      id: l.category.id,
      name: l.category.name,
      slug: l.category.slug,
      parent: l.category.parent
        ? { id: l.category.parent.id, name: l.category.parent.name, slug: l.category.parent.slug }
        : null,
    },
    regionId: l.regionId,
    images: l.images.map(toImageDto),
    deliveryPickup: l.deliveryPickup,
    deliveryLocal: l.deliveryLocal,
    deliveryNotes: l.deliveryNotes,
    shipTo: l.shipTo.map((s) => s.country.code as CountryCode),
    seller: {
      shopName: sp?.shopName ?? l.seller.name,
      slug: sp?.slug ?? '',
      town: sp?.town ?? null,
      regionName: sp?.region?.name ?? null,
      countryCode: l.seller.country.code as CountryCode,
      memberSince: l.seller.createdAt.toISOString(),
    },
    rejectionReason: canSeeModeration ? l.rejectionReason : null,
    submittedAt: canSeeModeration ? (l.submittedAt?.toISOString() ?? null) : null,
    updatedAt: l.updatedAt.toISOString(),
    isOwner,
  };
}
