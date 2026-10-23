import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useMe } from '../lib/auth';
import { RequireAuth } from './RequireAuth';

export function RequireAdmin({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const { data: user } = useMe();
  return (
    <RequireAuth>
      {user?.role === 'ADMIN' ? (
        children
      ) : (
        <p className="text-stone-600">{t('admin.notAllowed')}</p>
      )}
    </RequireAuth>
  );
}
