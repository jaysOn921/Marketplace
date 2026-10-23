import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router';
import { Alert } from '../../components/Form';
import { post } from '../../lib/api';
import { meKey } from '../../lib/auth';
import { apiErrors } from '../../lib/forms';
import { AuthLayout } from './AuthLayout';

export function VerifyEmailPage() {
  const { t } = useTranslation();
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const qc = useQueryClient();
  const verify = useMutation({
    mutationFn: () => post('/auth/verify-email', { token }),
    onSuccess: () => qc.invalidateQueries({ queryKey: meKey }),
  });

  // Links are single-use: make sure we only submit once (React StrictMode runs effects twice in dev).
  const sent = useRef(false);
  useEffect(() => {
    if (token && !sent.current) {
      sent.current = true;
      verify.mutate();
    }
  }, [token, verify]);

  return (
    <AuthLayout title={t('auth.verify.title')}>
      {verify.isSuccess && <Alert kind="success">{t('auth.verify.done')}</Alert>}
      {(verify.isError || !token) && (
        <Alert>{token ? apiErrors(verify.error).message : t('auth.reset.badLink')}</Alert>
      )}
      {verify.isPending && <p className="text-stone-500">{t('auth.verify.checking')}</p>}
      <Link
        to="/account"
        className="mt-4 inline-block text-sm font-medium text-brand-700 hover:underline"
      >
        {t('auth.verify.toAccount')}
      </Link>
    </AuthLayout>
  );
}
