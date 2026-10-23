import type { ListingSummary } from '@tzed/shared';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { Price } from './Price';
import { RatingSummary } from './Stars';

const FLAG = { TZ: '🇹🇿', ZM: '🇿🇲' } as const;

export function ListingCard({ listing }: { listing: ListingSummary }) {
  const { t } = useTranslation();
  const other = listing.countryCode === 'TZ' ? 'ZM' : 'TZ';
  return (
    <li className="group overflow-hidden rounded-xl border border-stone-200 bg-white transition hover:border-brand-600 hover:shadow-sm">
      <Link
        to={`/listings/${listing.id}`}
        className="block focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-600"
      >
        <div className="relative aspect-square bg-stone-100">
          {listing.coverImage ? (
            <img
              src={listing.coverImage.thumbUrl}
              alt=""
              loading="lazy"
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-stone-400">
              {t('listing.noPhotos')}
            </div>
          )}
          {listing.crossBorder && (
            <span className="absolute left-2 top-2 rounded-full bg-white/95 px-2 py-0.5 text-xs font-medium text-stone-800 shadow-sm">
              {t('card.shipsTo', { flag: FLAG[other] })}
            </span>
          )}
        </div>
        <div className="space-y-1 p-3">
          <h3 className="line-clamp-2 text-sm font-medium text-stone-900 group-hover:text-brand-800">
            {listing.title}
          </h3>
          <Price amount={listing.price} currency={listing.currency} size="sm" />
          <p className="truncate text-xs text-stone-500">
            <span aria-hidden="true">{FLAG[listing.countryCode]} </span>
            {listing.town}, {listing.regionName}
          </p>
          <RatingSummary rating={listing.sellerRating} compact />
        </div>
      </Link>
    </li>
  );
}

export function ListingGrid({ listings }: { listings: ListingSummary[] }) {
  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {listings.map((l) => (
        <ListingCard key={l.id} listing={l} />
      ))}
    </ul>
  );
}
