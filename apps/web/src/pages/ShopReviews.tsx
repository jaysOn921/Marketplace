import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { RatingSummary, Stars } from '../components/Stars';
import { useShopReviews } from '../lib/reviews';

const FLAG = { TZ: '🇹🇿', ZM: '🇿🇲' } as const;

export function ShopReviews({ slug }: { slug: string }) {
  const { t, i18n } = useTranslation();
  const [page, setPage] = useState(1);
  const { data } = useShopReviews(slug, page);
  if (!data) return null;
  const total = data.rating?.count ?? 0;

  return (
    <section
      id="reviews"
      className="space-y-4 rounded-xl border border-stone-200 bg-white p-5"
      aria-labelledby="reviews-heading"
    >
      <h2 id="reviews-heading" className="text-lg font-semibold">
        {t('reviews.title')}
      </h2>
      {!total ? (
        <p className="text-sm text-stone-600">{t('reviews.noneYet')}</p>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-6">
            <div>
              <p className="text-3xl font-bold">{data.rating!.average.toFixed(1)}</p>
              <RatingSummary rating={data.rating} />
            </div>
            <ul className="min-w-48 flex-1 space-y-1 text-xs" aria-label={t('reviews.breakdown')}>
              {([5, 4, 3, 2, 1] as const).map((s) => (
                <li key={s} className="flex items-center gap-2">
                  <span className="w-12">{t('reviews.starOption', { count: s })}</span>
                  <span className="h-2 flex-1 overflow-hidden rounded-full bg-stone-100">
                    <span
                      className="block h-full bg-accent-500"
                      style={{ width: `${(data.breakdown[s] / total) * 100}%` }}
                    />
                  </span>
                  <span className="w-6 text-right text-stone-500">{data.breakdown[s]}</span>
                </li>
              ))}
            </ul>
          </div>
          <ul className="divide-y divide-stone-100">
            {data.reviews.map((r) => (
              <li key={r.id} className="py-3 text-sm">
                <div className="flex flex-wrap items-center gap-x-2">
                  <Stars value={r.rating} />
                  <span className="font-medium">
                    {r.reviewerName} <span aria-hidden="true">{FLAG[r.reviewerCountry]}</span>
                  </span>
                  <span className="text-stone-500">
                    {new Date(r.createdAt).toLocaleDateString(i18n.language, {
                      dateStyle: 'medium',
                    })}
                  </span>
                </div>
                {r.comment && (
                  <p className="mt-1 whitespace-pre-line text-stone-700">{r.comment}</p>
                )}
                <p className="mt-0.5 text-xs text-stone-500">
                  {t('reviews.bought', { title: r.listingTitle })}
                </p>
              </li>
            ))}
          </ul>
          {data.pageCount > 1 && (
            <div className="flex justify-center gap-2">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage(page - 1)}
                className="rounded-lg border border-stone-300 px-3 py-1.5 text-sm disabled:opacity-40"
              >
                {t('search.prev')}
              </button>
              <button
                type="button"
                disabled={page >= data.pageCount}
                onClick={() => setPage(page + 1)}
                className="rounded-lg border border-stone-300 px-3 py-1.5 text-sm disabled:opacity-40"
              >
                {t('search.next')}
              </button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
