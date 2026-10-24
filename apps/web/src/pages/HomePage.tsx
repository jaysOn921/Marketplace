import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { ListingGrid } from '../components/ListingCard';
import { SearchBar } from '../components/SearchBar';
import { useMe } from '../lib/auth';
import { useCategories } from '../lib/listings';
import { toApiQuery, useSearch } from '../lib/search';
import { useCategoryName } from '../lib/categoryName';

function Section({
  title,
  to,
  query,
}: {
  title: string;
  to: string;
  query: Record<string, string>;
}) {
  const { t } = useTranslation();
  const { data } = useSearch(toApiQuery({ ...query, pageSize: '8' }));
  if (!data?.results.length) return null;
  return (
    <section>
      <div className="mb-3 flex items-baseline justify-between gap-4">
        <h2 className="text-xl font-semibold">{title}</h2>
        <Link
          to={to}
          className="shrink-0 whitespace-nowrap text-sm font-medium text-brand-700 hover:underline"
        >
          {t('home.seeAll')}
        </Link>
      </div>
      <ListingGrid listings={data.results} />
    </section>
  );
}

export function HomePage() {
  const { t } = useTranslation();
  const catName = useCategoryName();
  const { data: categories } = useCategories();
  const { data: user } = useMe();
  // Cross-border deals for the viewer's country; for guests, the main TZ → ZM route.
  const buyer = user?.countryCode ?? 'ZM';
  const seller = buyer === 'ZM' ? 'TZ' : 'ZM';

  return (
    <div className="space-y-12">
      <section className="rounded-2xl bg-gradient-to-br from-brand-700 to-brand-800 px-6 py-10 text-white md:px-12 md:py-12">
        <h1 className="max-w-2xl text-3xl font-bold tracking-tight md:text-4xl">
          {t('home.heroTitle')}
        </h1>
        <p className="mt-4 max-w-xl text-brand-100">{t('home.heroBody')}</p>
        <div className="mt-6 max-w-xl text-stone-900">
          <SearchBar />
        </div>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            to="/search"
            className="rounded-lg bg-white px-5 py-2.5 font-medium text-brand-800 hover:bg-brand-50"
          >
            {t('home.ctaBrowse')}
          </Link>
          <Link
            to="/sell"
            className="rounded-lg bg-accent-500 px-5 py-2.5 font-medium text-stone-900 hover:bg-accent-400"
          >
            {t('home.ctaSell')}
          </Link>
        </div>
      </section>

      {categories && (
        <section>
          <h2 className="mb-3 text-xl font-semibold">{t('home.categories')}</h2>
          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
            {categories.map((c) => (
              <li key={c.slug}>
                <Link
                  to={`/search?category=${c.slug}`}
                  className="block rounded-lg border border-stone-200 bg-white px-4 py-3 text-sm font-medium hover:border-brand-600 hover:text-brand-800"
                >
                  {catName(c)}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <Section
        title={t('home.crossBorder', {
          from: t(`countries.${seller}`),
          to: t(`countries.${buyer}`),
        })}
        to={`/search?country=${seller}&availableIn=${buyer}`}
        query={{ country: seller, availableIn: buyer }}
      />
      <Section title={t('home.latest')} to="/search?sort=newest" query={{ sort: 'newest' }} />

      <section>
        <h2 className="text-xl font-semibold">{t('home.howTitle')}</h2>
        <ul className="mt-4 grid gap-4 md:grid-cols-3">
          {([1, 2, 3] as const).map((n) => (
            <li key={n} className="rounded-xl border border-stone-200 bg-white p-5">
              <h3 className="font-medium text-brand-800">{t(`home.how${n}Title`)}</h3>
              <p className="mt-1 text-sm text-stone-600">{t(`home.how${n}Body`)}</p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
