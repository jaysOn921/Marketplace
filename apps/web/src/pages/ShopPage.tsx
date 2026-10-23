import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams, useSearchParams } from 'react-router';
import { ListingGrid } from '../components/ListingCard';
import { RatingSummary } from '../components/Stars';
import { toApiQuery, useSearch, useShop } from '../lib/search';
import { ShopReviews } from './ShopReviews';

const FLAG = { TZ: '🇹🇿', ZM: '🇿🇲' } as const;

export function ShopPage() {
  const { t, i18n } = useTranslation();
  const { slug } = useParams();
  const [params, setParams] = useSearchParams();
  const { data: shop, isPending, isError } = useShop(slug);
  const [q, setQ] = useState(params.get('q') ?? '');
  const query = toApiQuery({
    seller: slug,
    q: params.get('q') ?? undefined,
    page: params.get('page') ?? undefined,
  });
  const { data: results } = useSearch(query, Boolean(shop));

  if (isPending) return <p className="text-stone-500">{t('common.loading')}</p>;
  if (isError || !shop) {
    return (
      <div className="py-16 text-center">
        <h1 className="text-2xl font-semibold">{t('shop.notFound')}</h1>
        <Link to="/search" className="mt-4 inline-block font-medium text-brand-700 hover:underline">
          {t('home.ctaBrowse')}
        </Link>
      </div>
    );
  }

  function onSearch(e: FormEvent) {
    e.preventDefault();
    setParams(q.trim() ? { q: q.trim() } : {});
  }

  return (
    <div className="space-y-6">
      <header className="rounded-xl border border-stone-200 bg-white p-5 md:p-6">
        <div className="flex flex-wrap items-center gap-4">
          <span className="flex h-14 w-14 items-center justify-center rounded-xl bg-brand-100 text-xl font-bold text-brand-800">
            {shop.shopName.slice(0, 1).toUpperCase()}
          </span>
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold">{shop.shopName}</h1>
            <a href="#reviews" className="block hover:underline">
              <RatingSummary rating={shop.rating} />
            </a>
            <p className="text-sm text-stone-600">
              <span aria-hidden="true">{FLAG[shop.countryCode]} </span>
              {[shop.town, shop.regionName, t(`countries.${shop.countryCode}`)]
                .filter(Boolean)
                .join(', ')}
            </p>
            <p className="text-xs text-stone-500">
              {t('listing.memberSince', {
                date: new Date(shop.memberSince).toLocaleDateString(i18n.language, {
                  dateStyle: 'medium',
                }),
              })}{' '}
              · {t('shop.liveCount', { count: shop.activeListings })}
            </p>
          </div>
        </div>
        {shop.bio && <p className="mt-4 whitespace-pre-line text-stone-700">{shop.bio}</p>}
      </header>

      <form role="search" onSubmit={onSearch} className="flex max-w-md">
        <label htmlFor="shop-search" className="sr-only">
          {t('shop.searchLabel', { shop: shop.shopName })}
        </label>
        <input
          id="shop-search"
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t('shop.searchPlaceholder')}
          className="min-w-0 flex-1 rounded-l-lg border border-stone-300 bg-white px-3 py-2 text-sm"
        />
        <button
          type="submit"
          className="rounded-r-lg border border-l-0 border-stone-300 bg-white px-4 text-sm font-medium hover:bg-stone-50"
        >
          {t('search.button')}
        </button>
      </form>

      {results && results.results.length > 0 ? (
        <ListingGrid listings={results.results} />
      ) : (
        results && (
          <p className="text-stone-600">{t(params.get('q') ? 'shop.noResults' : 'shop.empty')}</p>
        )
      )}
      <ShopReviews slug={shop.slug} />
    </div>
  );
}
