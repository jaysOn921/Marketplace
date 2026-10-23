import { useMutation } from '@tanstack/react-query';
import { PASSWORD_MIN, resetPasswordSchema } from '@tzed/shared';
import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router';
import { Alert, SubmitButton, TextField } from '../../components/Form';
import { post } from '../../lib/api';
import { apiErrors, validate, type FieldErrors } from '../../lib/forms';
import { AuthLayout } from './AuthLayout';

export function ResetPasswordPage() {
  const { t } = useTranslation();
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});
  const reset = useMutation({
    mutationFn: (data: { token: string; password: string }) => post('/auth/reset-password', data),
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const { data, errors } = validate(resetPasswordSchema, { token, password });
    setErrors(errors ?? {});
    if (data) reset.mutate(data);
  }

  const server = apiErrors(reset.error);
  if (!token || errors.token) {
    return (
      <AuthLayout title={t('auth.reset.title')}>
        <Alert>{t('auth.reset.badLink')}</Alert>
        <Link
          to="/forgot-password"
          className="mt-4 inline-block text-sm text-brand-700 hover:underline"
        >
          {t('auth.reset.requestNew')}
        </Link>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title={t('auth.reset.title')} intro={t('auth.reset.intro')}>
      {reset.isSuccess ? (
        <div className="space-y-4">
          <Alert kind="success">{t('auth.reset.done')}</Alert>
          <Link
            to="/login"
            className="inline-block text-sm font-medium text-brand-700 hover:underline"
          >
            {t('auth.login.submit')}
          </Link>
        </div>
      ) : (
        <form onSubmit={onSubmit} noValidate className="space-y-4">
          {server.message && (
            <Alert>
              {server.message}{' '}
              <Link to="/forgot-password" className="underline">
                {t('auth.reset.requestNew')}
              </Link>
            </Alert>
          )}
          <TextField
            label={t('auth.fields.newPassword')}
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            error={errors.password ?? server.fields.password}
            hint={t('auth.register.passwordHint', { min: PASSWORD_MIN })}
          />
          <SubmitButton pending={reset.isPending}>{t('auth.reset.submit')}</SubmitButton>
        </form>
      )}
    </AuthLayout>
  );
}
