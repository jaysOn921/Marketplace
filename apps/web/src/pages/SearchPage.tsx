import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router';

export function SearchPage() {
  const { t } = useTranslation();
  const [params] = useSearchParams();
  const q = params.get('q');

  return (
    <div>
      <h1 className="text-2xl font-semibold">
        {q ? t('search.resultsFor', { q }) : t('search.title')}
      </h1>
      <p className="mt-4 rounded-lg border border-dashed border-stone-300 bg-white p-6 text-stone-600">
        {t('search.comingSoon')}
      </p>
    </div>
  );
}
