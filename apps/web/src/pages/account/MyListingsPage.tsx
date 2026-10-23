import type { ListingStatus } from '@tzed/shared';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router';
import { Price } from '../../components/Price';
import { StatusBadge } from '../../components/StatusBadge';
import { useMyListings } from '../../lib/listings';

const TABS: (ListingStatus | 'ALL')[] = [
  'ALL',
  'DRAFT',
  'PENDING_REVIEW',
  'ACTIVE',
  'REJECTED',
  'SOLD',
];

export function MyListingsPage() {
  const { t, i18n } = useTranslation();
  const [params, setParams] = useSearchParams();
  const tab = (params.get('status') as ListingStatus | null) ?? undefined;
  const { data, isPending } = useMyListings(tab);
  const all = useMyListings();
  const counts = all.data?.counts ?? {};
  const total = Object.values(counts).reduce((a, b) => a + (b ?? 0), 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">{t('myListings.title')}</h1>
        <Link
          to="/listings/new"
          className="rounded-lg bg-brand-700 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-800"
        >
          {t('myListings.new')}
        </Link>
      </div>

      <nav
        className="flex gap-1 overflow-x-auto border-b border-stone-200"
        aria-label={t('myListings.filter')}
      >
        {TABS.map((s) => {
          const active = (s === 'ALL' && !tab) || s === tab;
          const count = s === 'ALL' ? total : (counts[s] ?? 0);
          return (
            <button
              key={s}
              type="button"
              onClick={() => setParams(s === 'ALL' ? {} : { status: s })}
              aria-current={active}
              className={`whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium ${
                active
                  ? 'border-brand-700 text-brand-800'
                  : 'border-transparent text-stone-600 hover:text-stone-900'
              }`}
            >
              {s === 'ALL' ? t('myListings.all') : t(`listingStatus.${s}`)}{' '}
              <span className="text-stone-500">({count})</span>
            </button>
          );
        })}
      </nav>

      {isPending ? (
        <p className="text-stone-500">{t('common.loading')}</p>
      ) : !data?.listings.length ? (
        <div className="rounded-xl border border-dashed border-stone-300 bg-white p-8 text-center text-stone-600">
          <p>{t(tab ? 'myListings.emptyTab' : 'myListings.empty')}</p>
        </div>
      ) : (
        <ul className="divide-y divide-stone-100 overflow-hidden rounded-xl border border-stone-200 bg-white">
          {data.listings.map((l) => (
            <li key={l.id} className="flex items-center gap-4 p-3 sm:p-4">
              {l.coverImage ? (
                <img
                  src={l.coverImage.thumbUrl}
                  alt=""
                  className="h-16 w-16 shrink-0 rounded-lg object-cover"
                />
              ) : (
                <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg bg-stone-100 text-xs text-stone-500">
                  {t('myListings.noPhoto')}
                </div>
              )}
              <div className="min-w-0 flex-1">
                <Link
                  to={`/listings/${l.id}/edit`}
                  className="block truncate font-medium hover:text-brand-700"
                >
                  {l.title}
                </Link>
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
                  <StatusBadge status={l.status} />
                  <span className="text-xs text-stone-500">
                    {t('myListings.updated', {
                      date: new Date(l.publishedAt ?? l.createdAt).toLocaleDateString(
                        i18n.language,
                        { dateStyle: 'medium' },
                      ),
                    })}
                  </span>
                </div>
              </div>
              <div className="hidden text-right sm:block">
                <Price amount={l.price} currency={l.currency} size="sm" />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
