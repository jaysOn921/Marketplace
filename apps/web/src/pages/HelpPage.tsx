import { useTranslation } from 'react-i18next';

export function HelpPage() {
  const { t } = useTranslation();

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-semibold">{t('help.title')}</h1>
      <p className="mt-2 text-stone-600">{t('help.intro')}</p>
      <p className="mt-6 rounded-lg border border-dashed border-stone-300 bg-white p-6 text-stone-600">
        {t('help.comingSoon')}
      </p>
      <p className="mt-4 text-sm text-stone-700">{t('help.contact')}</p>
    </div>
  );
}
