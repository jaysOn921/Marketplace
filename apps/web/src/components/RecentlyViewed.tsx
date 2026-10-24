import { useTranslation } from 'react-i18next';
import { clearViewed, useRecentlyViewed } from '../lib/recent';
import { ListingCard } from './ListingCard';

/** Listings viewed on this device (no account needed). Hidden when there are none. */
export function RecentlyViewed({ exclude, limit = 6 }: { exclude?: number; limit?: number }) {
  const { t } = useTranslation();
  const { data } = useRecentlyViewed(exclude);
  const listings = data?.slice(0, limit) ?? [];
  if (!listings.length) return null;
  return (
    <section aria-labelledby="recent-heading">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 id="recent-heading" className="text-xl font-semibold">
          {t('recent.title')}
        </h2>
        <button
          type="button"
          onClick={clearViewed}
          className="text-sm text-brand-700 underline hover:text-brand-800"
        >
          {t('recent.clear')}
        </button>
      </div>
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {listings.map((l) => (
          <ListingCard key={l.id} listing={l} />
        ))}
      </ul>
    </section>
  );
}
