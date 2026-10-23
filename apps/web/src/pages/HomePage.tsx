import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';

export function HomePage() {
  const { t } = useTranslation();
  const steps = [1, 2, 3] as const;

  return (
    <div className="space-y-12">
      <section className="rounded-2xl bg-gradient-to-br from-brand-700 to-brand-800 px-6 py-12 text-white md:px-12">
        <h1 className="max-w-2xl text-3xl font-bold tracking-tight md:text-4xl">
          {t('home.heroTitle')}
        </h1>
        <p className="mt-4 max-w-xl text-brand-100">{t('home.heroBody')}</p>
        <div className="mt-8 flex flex-wrap gap-3">
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

      <section>
        <h2 className="text-xl font-semibold">{t('home.howTitle')}</h2>
        <ul className="mt-4 grid gap-4 md:grid-cols-3">
          {steps.map((n) => (
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
