import { useTranslation } from 'react-i18next';
import { Link, Navigate } from 'react-router';
import { useMe } from '../lib/auth';

/** Entry point for "Sell": explains the steps, or goes straight to a new listing. */
export function SellPage() {
  const { t } = useTranslation();
  const { data: user, isPending } = useMe();
  if (isPending) return null;
  if (user?.emailVerified && user.sellerProfile) return <Navigate to="/listings/new" replace />;

  const steps = [
    {
      done: Boolean(user),
      label: t('sell.step1'),
      to: '/register?next=/sell',
      cta: t('auth.register.submit'),
    },
    {
      done: Boolean(user?.emailVerified),
      label: t('sell.step2'),
      to: '/account',
      cta: t('nav.account'),
    },
    {
      done: Boolean(user?.sellerProfile),
      label: t('sell.step3'),
      to: '/account/seller',
      cta: t('account.seller.create'),
    },
  ];
  const next = steps.find((s) => !s.done);

  return (
    <div className="mx-auto max-w-xl">
      <h1 className="text-2xl font-semibold">{t('sell.title')}</h1>
      <p className="mt-2 text-stone-600">{t('sell.intro')}</p>
      <ol className="mt-6 space-y-3">
        {steps.map((s, i) => (
          <li
            key={s.label}
            className="flex items-center gap-3 rounded-lg border border-stone-200 bg-white p-4"
          >
            <span
              className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
                s.done ? 'bg-brand-700 text-white' : 'bg-stone-100 text-stone-600'
              }`}
            >
              {s.done ? '✓' : i + 1}
            </span>
            <span className={s.done ? 'text-stone-500 line-through' : 'font-medium'}>
              {s.label}
            </span>
          </li>
        ))}
      </ol>
      {next && (
        <Link
          to={next.to}
          className="mt-6 inline-block rounded-lg bg-brand-700 px-5 py-2.5 font-medium text-white hover:bg-brand-800"
        >
          {next.cta}
        </Link>
      )}
      {!user && (
        <p className="mt-4 text-sm text-stone-600">
          {t('auth.register.haveAccount')}{' '}
          <Link to="/login?next=/sell" className="font-medium text-brand-700 hover:underline">
            {t('auth.login.submit')}
          </Link>
        </p>
      )}
    </div>
  );
}
