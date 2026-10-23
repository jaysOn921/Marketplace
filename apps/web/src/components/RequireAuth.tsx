import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate, useLocation } from 'react-router';
import { useMe } from '../lib/auth';

export function RequireAuth({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const { data: user, isPending } = useMe();
  const location = useLocation();

  if (isPending) return <p className="text-stone-500">{t('common.loading')}</p>;
  if (!user) {
    const next = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/login?next=${next}`} replace />;
  }
  return <>{children}</>;
}
