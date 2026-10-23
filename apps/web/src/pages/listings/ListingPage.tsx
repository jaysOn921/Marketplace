import type { ListingDetail } from '@tzed/shared';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router';
import { AskSeller } from '../../components/AskSeller';
import { BuyBox } from '../../components/BuyBox';
import { Alert } from '../../components/Form';
import { Price } from '../../components/Price';
import { StatusBadge } from '../../components/StatusBadge';
import { useListing } from '../../lib/listings';

const FLAG = { TZ: '🇹🇿', ZM: '🇿🇲' } as const;

function Gallery({ listing }: { listing: ListingDetail }) {
  const { t } = useTranslation();
  const [active, setActive] = useState(0);
  const images = listing.images;
  const current = images[active] ?? images[0];

  if (!current) {
    return (
      <div className="flex aspect-[4/3] items-center justify-center rounded-xl bg-stone-100 text-stone-400">
        {t('listing.noPhotos')}
      </div>
    );
  }
  return (
    <div>
      <div className="overflow-hidden rounded-xl bg-stone-100">
        <img
          src={current.url}
          alt={t('listing.photoOf', { title: listing.title, n: active + 1, total: images.length })}
          width={current.width}
          height={current.height}
          className="mx-auto max-h-[70vh] w-full object-contain"
        />
      </div>
      {images.length > 1 && (
        <ul className="mt-3 flex gap-2 overflow-x-auto pb-1">
          {images.map((img, i) => (
            <li key={img.id} className="shrink-0">
              <button
                type="button"
                onClick={() => setActive(i)}
                aria-label={t('photos.alt', { n: i + 1 })}
                aria-current={i === active}
                className={`overflow-hidden rounded-lg border-2 ${i === active ? 'border-brand-600' : 'border-transparent'}`}
              >
                <img src={img.thumbUrl} alt="" className="h-16 w-16 object-cover" loading="lazy" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function OwnerBanner({ listing }: { listing: ListingDetail }) {
  const { t } = useTranslation();
  if (!listing.isOwner) return null;
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-stone-200 bg-white px-4 py-3 text-sm">
      <StatusBadge status={listing.status} />
      <span className="text-stone-600">{t(`listingForm.status.explain.${listing.status}`)}</span>
      <Link
        to={`/listings/${listing.id}/edit`}
        className="ml-auto font-medium text-brand-700 hover:underline"
      >
        {t('listing.edit')}
      </Link>
    </div>
  );
}

export function ListingPage() {
  const { t, i18n } = useTranslation();
  const id = Number(useParams().id);
  const { data: listing, isPending, isError } = useListing(id);

  if (isPending) return <p className="text-stone-500">{t('common.loading')}</p>;
  if (isError || !listing) {
    return (
      <div className="py-16 text-center">
        <h1 className="text-2xl font-semibold">{t('listing.notFound')}</h1>
        <Link to="/search" className="mt-4 inline-block font-medium text-brand-700 hover:underline">
          {t('home.ctaBrowse')}
        </Link>
      </div>
    );
  }

  const date = (iso: string | null) =>
    iso ? new Date(iso).toLocaleDateString(i18n.language, { dateStyle: 'medium' }) : '';
  const otherCountry = listing.countryCode === 'TZ' ? 'ZM' : 'TZ';
  const deliveries = [
    listing.deliveryPickup && t('listing.delivery.pickup', { town: listing.town }),
    listing.deliveryLocal && t('listing.delivery.local'),
    listing.crossBorder &&
      t('listing.delivery.crossBorder', { country: t(`countries.${otherCountry}`) }),
  ].filter(Boolean) as string[];

  return (
    <div className="space-y-6">
      <OwnerBanner listing={listing} />
      <nav className="text-sm text-stone-500" aria-label={t('listing.breadcrumb')}>
        {listing.category.parent && (
          <>
            <Link
              to={`/search?category=${listing.category.parent.slug}`}
              className="hover:text-brand-700 hover:underline"
            >
              {listing.category.parent.name}
            </Link>
            {' › '}
          </>
        )}
        <Link
          to={`/search?category=${listing.category.slug}`}
          className="hover:text-brand-700 hover:underline"
        >
          {listing.category.name}
        </Link>
      </nav>

      <div className="grid gap-8 lg:grid-cols-[3fr_2fr]">
        <Gallery listing={listing} />

        <div className="space-y-6">
          <div>
            <h1 className="text-2xl font-semibold leading-tight">{listing.title}</h1>
            <div className="mt-3">
              <Price amount={listing.price} currency={listing.currency} size="lg" showConvert />
            </div>
            {listing.status === 'SOLD' && (
              <p className="mt-3 inline-block rounded-full bg-sky-100 px-3 py-1 text-sm font-medium text-sky-800">
                {t('listingStatus.SOLD')}
              </p>
            )}
          </div>

          <BuyBox listing={listing} />
          <AskSeller listing={listing} />

          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-xl border border-stone-200 bg-white p-4 text-sm">
            <dt className="text-stone-500">{t('listingForm.fields.condition')}</dt>
            <dd className="font-medium">{t(`condition.${listing.condition}`)}</dd>
            <dt className="text-stone-500">{t('listing.available')}</dt>
            <dd className="font-medium">{listing.status === 'SOLD' ? 0 : listing.quantity}</dd>
            <dt className="text-stone-500">{t('listing.location')}</dt>
            <dd className="font-medium">
              <span aria-hidden="true">{FLAG[listing.countryCode]} </span>
              {listing.town}, {listing.regionName}
            </dd>
            <dt className="text-stone-500">{t('listing.posted')}</dt>
            <dd className="font-medium">{date(listing.publishedAt ?? listing.createdAt)}</dd>
          </dl>

          <section className="rounded-xl border border-stone-200 bg-white p-4">
            <h2 className="font-semibold">{t('listing.delivery.title')}</h2>
            <ul className="mt-2 list-inside list-disc space-y-1 text-sm text-stone-700">
              {deliveries.map((d) => (
                <li key={d}>{d}</li>
              ))}
            </ul>
            {listing.deliveryNotes && (
              <p className="mt-2 whitespace-pre-line text-sm text-stone-600">
                {listing.deliveryNotes}
              </p>
            )}
            {listing.crossBorder && (
              <div className="mt-3">
                <Alert kind="info">
                  <p className="font-medium">
                    {t('listing.crossBorder.title', {
                      a: t(`countries.${listing.countryCode}`),
                      b: t(`countries.${otherCountry}`),
                    })}
                  </p>
                  <p className="mt-1">{t('listing.crossBorder.customs')}</p>
                </Alert>
              </div>
            )}
          </section>

          <section className="rounded-xl border border-stone-200 bg-white p-4">
            <h2 className="text-sm font-medium text-stone-500">{t('listing.seller')}</h2>
            {listing.seller.slug ? (
              <Link
                to={`/shop/${listing.seller.slug}`}
                className="mt-1 block font-semibold text-brand-800 hover:underline"
              >
                {listing.seller.shopName}
              </Link>
            ) : (
              <p className="mt-1 font-semibold">{listing.seller.shopName}</p>
            )}
            <p className="text-sm text-stone-600">
              <span aria-hidden="true">{FLAG[listing.seller.countryCode]} </span>
              {[listing.seller.town, listing.seller.regionName].filter(Boolean).join(', ')}
            </p>
            <p className="mt-1 text-xs text-stone-500">
              {t('listing.memberSince', { date: date(listing.seller.memberSince) })}
            </p>
          </section>
        </div>
      </div>

      <section className="max-w-3xl">
        <h2 className="text-lg font-semibold">{t('listing.description')}</h2>
        <p className="mt-2 whitespace-pre-line text-stone-700">{listing.description}</p>
      </section>
    </div>
  );
}
