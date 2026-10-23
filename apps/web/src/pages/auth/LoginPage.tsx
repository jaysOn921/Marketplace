import { loginSchema } from '@tzed/shared';
import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router';
import { Alert, SubmitButton, TextField } from '../../components/Form';
import { safeNext, useLogin, useMe } from '../../lib/auth';
import { apiErrors, validate, type FieldErrors } from '../../lib/forms';
import { AuthLayout } from './AuthLayout';

export function LoginPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = safeNext(params.get('next'));
  const { data: me } = useMe();
  const login = useLogin();
  const [values, setValues] = useState({ email: '', password: '' });
  const [errors, setErrors] = useState<FieldErrors>({});

  if (me) return <Navigate to={next} replace />;

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const { data, errors } = validate(loginSchema, values);
    setErrors(errors ?? {});
    if (data) login.mutate(data, { onSuccess: () => navigate(next, { replace: true }) });
  }

  const server = apiErrors(login.error);
  return (
    <AuthLayout title={t('auth.login.title')} intro={t('auth.login.intro')}>
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        {server.message && <Alert>{server.message}</Alert>}
        <TextField
          label={t('auth.fields.email')}
          type="email"
          autoComplete="email"
          value={values.email}
          onChange={(e) => setValues({ ...values, email: e.target.value })}
          error={errors.email ?? server.fields.email}
        />
        <TextField
          label={t('auth.fields.password')}
          type="password"
          autoComplete="current-password"
          value={values.password}
          onChange={(e) => setValues({ ...values, password: e.target.value })}
          error={errors.password ?? server.fields.password}
        />
        <div className="flex items-center justify-between gap-4">
          <SubmitButton pending={login.isPending}>{t('auth.login.submit')}</SubmitButton>
          <Link to="/forgot-password" className="text-sm text-brand-700 hover:underline">
            {t('auth.login.forgot')}
          </Link>
        </div>
      </form>
      <p className="mt-6 border-t border-stone-100 pt-4 text-sm text-stone-600">
        {t('auth.login.noAccount')}{' '}
        <Link
          to={`/register${params.get('next') ? `?next=${encodeURIComponent(next)}` : ''}`}
          className="font-medium text-brand-700 hover:underline"
        >
          {t('auth.login.register')}
        </Link>
      </p>
    </AuthLayout>
  );
}
