import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { ListingGrid } from '../components/ListingCard';
import { useSaved } from '../lib/saved';

export function SavedPage() {
  const { t } = useTranslation();
  const { data, isPending } = useSaved();
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">{t('saved.title')}</h1>
        <p className="mt-1 text-sm text-stone-600">{t('saved.intro')}</p>
      </div>
      {isPending ? (
        <p className="text-stone-600">{t('common.loading')}</p>
      ) : data?.listings.length ? (
        <ListingGrid listings={data.listings} />
      ) : (
        <div className="rounded-xl border border-stone-200 bg-white p-8 text-center">
          <p className="text-stone-600">{t('saved.empty')}</p>
          <Link
            to="/search"
            className="mt-4 inline-block rounded-lg bg-brand-700 px-4 py-2 font-medium text-white hover:bg-brand-800"
          >
            {t('cart.browse')}
          </Link>
        </div>
      )}
    </div>
  );
}
