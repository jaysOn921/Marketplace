import { useMutation } from '@tanstack/react-query';
import { forgotPasswordSchema } from '@tzed/shared';
import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { Alert, SubmitButton, TextField } from '../../components/Form';
import { post } from '../../lib/api';
import { apiErrors, validate, type FieldErrors } from '../../lib/forms';
import { AuthLayout } from './AuthLayout';

export function ForgotPasswordPage() {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});
  const request = useMutation({
    mutationFn: (data: { email: string }) => post('/auth/forgot-password', data),
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const { data, errors } = validate(forgotPasswordSchema, { email });
    setErrors(errors ?? {});
    if (data) request.mutate(data);
  }

  const server = apiErrors(request.error);
  return (
    <AuthLayout title={t('auth.forgot.title')} intro={t('auth.forgot.intro')}>
      {request.isSuccess ? (
        <Alert kind="success">{t('auth.forgot.sent', { email })}</Alert>
      ) : (
        <form onSubmit={onSubmit} noValidate className="space-y-4">
          {server.message && <Alert>{server.message}</Alert>}
          <TextField
            label={t('auth.fields.email')}
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            error={errors.email ?? server.fields.email}
          />
          <SubmitButton pending={request.isPending}>{t('auth.forgot.submit')}</SubmitButton>
        </form>
      )}
      <p className="mt-6 border-t border-stone-100 pt-4 text-sm">
        <Link to="/login" className="text-brand-700 hover:underline">
          {t('auth.backToLogin')}
        </Link>
      </p>
    </AuthLayout>
  );
}
