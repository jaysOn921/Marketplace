import { COUNTRY_CODES, PASSWORD_MIN, registerSchema, type CountryCode } from '@tzed/shared';
import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router';
import { Alert, Field, SubmitButton, TextField } from '../../components/Form';
import { safeNext, useMe, useRegister } from '../../lib/auth';
import { apiErrors, validate, type FieldErrors } from '../../lib/forms';
import { AuthLayout } from './AuthLayout';

const FLAG: Record<CountryCode, string> = { TZ: '🇹🇿', ZM: '🇿🇲' };
const PHONE_PLACEHOLDER: Record<CountryCode, string> = { TZ: '0712 345 678', ZM: '0977 123 456' };

export function RegisterPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { data: me } = useMe();
  const register = useRegister();
  const [values, setValues] = useState({
    name: '',
    email: '',
    password: '',
    countryCode: '' as CountryCode | '',
    phone: '',
    consent: false,
    adult: false,
    marketing: false,
  });
  const [errors, setErrors] = useState<FieldErrors>({});

  if (me && !register.isSuccess) return <Navigate to="/account" replace />;

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const { data, errors } = validate(registerSchema, values);
    setErrors(errors ?? {});
    if (data) {
      register.mutate(data, {
        onSuccess: () => {
          const next = params.get('next');
          navigate(next ? safeNext(next) : '/account?welcome=1', { replace: true });
        },
      });
    }
  }

  const server = apiErrors(register.error);
  const err = (k: string) => errors[k] ?? server.fields[k];
  const country = values.countryCode || undefined;

  return (
    <AuthLayout title={t('auth.register.title')} intro={t('auth.register.intro')}>
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        {server.message && (
          <Alert>
            {server.message}{' '}
            {register.error && 'status' in register.error && register.error.status === 409 && (
              <Link to="/login" className="font-medium underline">
                {t('auth.login.submit')}
              </Link>
            )}
          </Alert>
        )}

        <fieldset>
          <legend className="mb-1 block text-sm font-medium text-stone-800">
            {t('auth.fields.country')}
          </legend>
          <div className="grid grid-cols-2 gap-2">
            {COUNTRY_CODES.map((code) => (
              <label
                key={code}
                className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2.5 text-sm has-[:checked]:border-brand-600 has-[:checked]:bg-brand-50 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand-100 ${
                  err('countryCode') ? 'border-red-500' : 'border-stone-300'
                }`}
              >
                <input
                  type="radio"
                  name="country"
                  value={code}
                  checked={values.countryCode === code}
                  onChange={() => setValues({ ...values, countryCode: code })}
                  className="sr-only"
                />
                <span aria-hidden="true" className="text-lg">
                  {FLAG[code]}
                </span>
                <span>
                  <span className="block font-medium">{t(`countries.${code}`)}</span>
                  <span className="block text-xs text-stone-500">
                    {t(`countries.currency.${code}`)}
                  </span>
                </span>
              </label>
            ))}
          </div>
          {err('countryCode') && <p className="mt-1 text-sm text-red-700">{err('countryCode')}</p>}
        </fieldset>

        <TextField
          label={t('auth.fields.name')}
          autoComplete="name"
          value={values.name}
          onChange={(e) => setValues({ ...values, name: e.target.value })}
          error={err('name')}
        />
        <TextField
          label={t('auth.fields.email')}
          type="email"
          autoComplete="email"
          value={values.email}
          onChange={(e) => setValues({ ...values, email: e.target.value })}
          error={err('email')}
        />
        <TextField
          label={t('auth.fields.phoneOptional')}
          type="tel"
          autoComplete="tel"
          placeholder={country ? PHONE_PLACEHOLDER[country] : ''}
          value={values.phone}
          onChange={(e) => setValues({ ...values, phone: e.target.value })}
          error={err('phone')}
          hint={t('auth.register.phoneHint')}
        />
        <TextField
          label={t('auth.fields.password')}
          type="password"
          autoComplete="new-password"
          value={values.password}
          onChange={(e) => setValues({ ...values, password: e.target.value })}
          error={err('password')}
          hint={t('auth.register.passwordHint', { min: PASSWORD_MIN })}
        />

        <Field label="" error={err('consent')}>
          {(a11y) => (
            <label htmlFor={a11y.id} className="flex items-start gap-2 text-sm text-stone-700">
              <input
                {...a11y}
                type="checkbox"
                checked={values.consent}
                onChange={(e) => setValues({ ...values, consent: e.target.checked })}
                className="mt-0.5 h-4 w-4 rounded border-stone-300 accent-brand-700"
              />
              <span>
                {t('auth.register.consentPrefix')}{' '}
                <Link to="/terms" target="_blank" className="text-brand-700 underline">
                  {t('footer.terms')}
                </Link>{' '}
                {t('auth.register.consentAnd')}{' '}
                <Link to="/privacy" target="_blank" className="text-brand-700 underline">
                  {t('footer.privacy')}
                </Link>
                .
              </span>
            </label>
          )}
        </Field>

        <Field label="" error={err('adult')}>
          {(a11y) => (
            <label htmlFor={a11y.id} className="flex items-start gap-2 text-sm text-stone-700">
              <input
                {...a11y}
                type="checkbox"
                checked={values.adult}
                onChange={(e) => setValues({ ...values, adult: e.target.checked })}
                className="mt-0.5 h-4 w-4 rounded border-stone-300 accent-brand-700"
              />
              <span>{t('auth.register.adult')}</span>
            </label>
          )}
        </Field>

        <label className="flex items-start gap-2 text-sm text-stone-700">
          <input
            type="checkbox"
            checked={values.marketing}
            onChange={(e) => setValues({ ...values, marketing: e.target.checked })}
            className="mt-0.5 h-4 w-4 rounded border-stone-300 accent-brand-700"
          />
          <span>{t('auth.register.marketing')}</span>
        </label>

        <SubmitButton pending={register.isPending}>{t('auth.register.submit')}</SubmitButton>
      </form>
      <p className="mt-6 border-t border-stone-100 pt-4 text-sm text-stone-600">
        {t('auth.register.haveAccount')}{' '}
        <Link to="/login" className="font-medium text-brand-700 hover:underline">
          {t('auth.login.submit')}
        </Link>
      </p>
    </AuthLayout>
  );
}
