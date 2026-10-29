import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  API_PREFIX,
  COUNTRY_CODES,
  PASSWORD_MIN,
  changePasswordSchema,
  deleteAccountSchema,
  updateProfileSchema,
  type MeResponse,
  type SessionUser,
  type UpdateProfileInput,
} from '@tzed/shared';
import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { Alert, Card, SelectField, SubmitButton, TextField } from '../../components/Form';
import { TwoStepSettings } from '../../components/TwoStepSettings';
import { clearCsrfToken, del, patch, post, put } from '../../lib/api';
import { meKey, useMe, useSetMe } from '../../lib/auth';
import { apiErrors, validate, type FieldErrors } from '../../lib/forms';

function VerifyBanner() {
  const { t } = useTranslation();
  const resend = useMutation({ mutationFn: () => post('/auth/resend-verification') });
  return (
    <Alert kind="info">
      <p>{t('account.verify.notice')}</p>
      {resend.isSuccess ? (
        <p className="mt-1 font-medium">{t('account.verify.sent')}</p>
      ) : (
        <button
          type="button"
          onClick={() => resend.mutate()}
          disabled={resend.isPending}
          className="mt-1 font-medium underline"
        >
          {t('account.verify.resend')}
        </button>
      )}
      {resend.isError && <p className="mt-1">{apiErrors(resend.error).message}</p>}
    </Alert>
  );
}

function ProfileForm({ user }: { user: SessionUser }) {
  const { t } = useTranslation();
  const setMe = useSetMe();
  const [values, setValues] = useState({
    name: user.name,
    countryCode: user.countryCode,
    phone: user.phone ?? '',
  });
  const [errors, setErrors] = useState<FieldErrors>({});
  const save = useMutation({
    mutationFn: (data: UpdateProfileInput) => patch<MeResponse>('/me', data),
    onSuccess: (data) => setMe(data.user),
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const { data, errors } = validate(updateProfileSchema, values);
    setErrors(errors ?? {});
    if (data) save.mutate(data);
  }

  const server = apiErrors(save.error);
  return (
    <Card title={t('account.profile.title')}>
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        {server.message && <Alert>{server.message}</Alert>}
        {save.isSuccess && <Alert kind="success">{t('account.saved')}</Alert>}
        <TextField label={t('auth.fields.email')} value={user.email} disabled readOnly />
        <TextField
          label={t('auth.fields.name')}
          value={values.name}
          onChange={(e) => setValues({ ...values, name: e.target.value })}
          error={errors.name ?? server.fields.name}
        />
        <SelectField
          label={t('auth.fields.country')}
          value={values.countryCode}
          onChange={(e) =>
            setValues({ ...values, countryCode: e.target.value as typeof values.countryCode })
          }
          error={errors.countryCode ?? server.fields.countryCode}
          hint={t('account.profile.countryHint')}
        >
          {COUNTRY_CODES.map((c) => (
            <option key={c} value={c}>
              {t(`countries.${c}`)}
            </option>
          ))}
        </SelectField>
        <TextField
          label={t('auth.fields.phoneOptional')}
          type="tel"
          value={values.phone}
          onChange={(e) => setValues({ ...values, phone: e.target.value })}
          error={errors.phone ?? server.fields.phone}
          hint={t('auth.register.phoneHint')}
        />
        <SubmitButton pending={save.isPending}>{t('account.save')}</SubmitButton>
      </form>
    </Card>
  );
}

function PasswordForm() {
  const { t } = useTranslation();
  const [values, setValues] = useState({ currentPassword: '', newPassword: '' });
  const [errors, setErrors] = useState<FieldErrors>({});
  const change = useMutation({
    mutationFn: (data: typeof values) => post('/me/password', data),
    onSuccess: () => setValues({ currentPassword: '', newPassword: '' }),
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const { data, errors } = validate(changePasswordSchema, values);
    setErrors(errors ?? {});
    if (data) change.mutate(data);
  }

  const server = apiErrors(change.error);
  return (
    <Card title={t('account.password.title')} description={t('account.password.intro')}>
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        {server.message && <Alert>{server.message}</Alert>}
        {change.isSuccess && <Alert kind="success">{t('account.password.done')}</Alert>}
        <TextField
          label={t('auth.fields.currentPassword')}
          type="password"
          autoComplete="current-password"
          value={values.currentPassword}
          onChange={(e) => setValues({ ...values, currentPassword: e.target.value })}
          error={errors.currentPassword ?? server.fields.currentPassword}
        />
        <TextField
          label={t('auth.fields.newPassword')}
          type="password"
          autoComplete="new-password"
          value={values.newPassword}
          onChange={(e) => setValues({ ...values, newPassword: e.target.value })}
          error={errors.newPassword ?? server.fields.newPassword}
          hint={t('auth.register.passwordHint', { min: PASSWORD_MIN })}
        />
        <SubmitButton pending={change.isPending}>{t('account.password.submit')}</SubmitButton>
      </form>
    </Card>
  );
}

function PhoneSharing({ user }: { user: SessionUser }) {
  const { t } = useTranslation();
  const setMe = useSetMe();
  const save = useMutation({
    mutationFn: (share: boolean) => put<MeResponse>('/me/phone-sharing', { share }),
    onSuccess: (data) => setMe(data.user),
  });
  return (
    <Card title={t('account.phoneSharing.title')} description={t('account.phoneSharing.intro')}>
      <label className="flex items-start gap-2 text-sm text-stone-700">
        <input
          type="checkbox"
          checked={save.isPending ? save.variables : user.sharePhoneOnOrders}
          disabled={save.isPending || (!user.phone && !user.sharePhoneOnOrders)}
          onChange={(e) => save.mutate(e.target.checked)}
          className="mt-0.5 h-4 w-4 rounded border-stone-300 accent-brand-700"
        />
        <span>{t('account.phoneSharing.label')}</span>
      </label>
      {!user.phone && (
        <p className="mt-2 text-sm text-stone-500">{t('account.phoneSharing.noPhone')}</p>
      )}
      {user.sellerProfile && (
        <p className="mt-2 text-sm text-stone-500">
          {t('account.phoneSharing.sellerNote')}{' '}
          <Link to="/account/seller" className="text-brand-700 underline">
            {t('account.phoneSharing.sellerLink')}
          </Link>
        </p>
      )}
      {save.isSuccess && (
        <p role="status" className="mt-2 text-sm text-brand-700">
          {t('account.emails.saved')}
        </p>
      )}
      {save.isError && <Alert>{apiErrors(save.error).message}</Alert>}
    </Card>
  );
}

function EmailPreferences({ user }: { user: SessionUser }) {
  const { t } = useTranslation();
  const setMe = useSetMe();
  const save = useMutation({
    mutationFn: (marketing: boolean) => put<MeResponse>('/me/marketing', { marketing }),
    onSuccess: (data) => setMe(data.user),
  });
  return (
    <Card title={t('account.emails.title')} description={t('account.emails.intro')}>
      <label className="flex items-start gap-2 text-sm text-stone-700">
        <input
          type="checkbox"
          checked={save.isPending ? save.variables : user.marketingEmails}
          disabled={save.isPending}
          onChange={(e) => save.mutate(e.target.checked)}
          className="mt-0.5 h-4 w-4 rounded border-stone-300 accent-brand-700"
        />
        <span>{t('auth.register.marketing')}</span>
      </label>
      {save.isSuccess && (
        <p role="status" className="mt-2 text-sm text-brand-700">
          {t('account.emails.saved')}
        </p>
      )}
      {save.isError && <Alert>{apiErrors(save.error).message}</Alert>}
    </Card>
  );
}

function DataAndDeletion() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [confirming, setConfirming] = useState(false);
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});
  const remove = useMutation({
    mutationFn: (data: { password: string }) => del('/me', data),
    onSuccess: () => {
      clearCsrfToken();
      qc.setQueryData<MeResponse>(meKey, { user: null });
      navigate('/?accountDeleted=1', { replace: true });
    },
  });

  function onDelete(e: FormEvent) {
    e.preventDefault();
    const { data, errors } = validate(deleteAccountSchema, { password });
    setErrors(errors ?? {});
    if (data) remove.mutate(data);
  }

  const server = apiErrors(remove.error);
  return (
    <Card title={t('account.data.title')} description={t('account.data.intro')}>
      <div className="space-y-6">
        <a
          href={`${API_PREFIX}/me/export`}
          className="inline-block rounded-lg border border-stone-300 px-4 py-2 text-sm font-medium hover:bg-stone-50"
        >
          {t('account.data.export')}
        </a>

        <div className="border-t border-stone-100 pt-5">
          <h3 className="font-medium text-red-800">{t('account.delete.title')}</h3>
          <p className="mt-1 text-sm text-stone-600">{t('account.delete.intro')}</p>
          {!confirming ? (
            <button
              type="button"
              onClick={() => setConfirming(true)}
              className="mt-3 rounded-lg border border-red-300 px-4 py-2 text-sm font-medium text-red-800 hover:bg-red-50"
            >
              {t('account.delete.start')}
            </button>
          ) : (
            <form onSubmit={onDelete} noValidate className="mt-3 space-y-3">
              {server.message && <Alert>{server.message}</Alert>}
              <TextField
                label={t('account.delete.confirmLabel')}
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                error={errors.password ?? server.fields.password}
              />
              <div className="flex gap-3">
                <SubmitButton variant="danger" pending={remove.isPending}>
                  {t('account.delete.confirm')}
                </SubmitButton>
                <button
                  type="button"
                  onClick={() => setConfirming(false)}
                  className="rounded-lg px-4 py-2 text-sm font-medium text-stone-700 hover:bg-stone-100"
                >
                  {t('common.cancel')}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </Card>
  );
}

export function AccountPage() {
  const { t } = useTranslation();
  const { data: user } = useMe();
  const [params] = useSearchParams();
  if (!user) return null;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{t('account.title')}</h1>
        <p className="mt-1 text-stone-600">{t('account.hello', { name: user.name })}</p>
      </div>
      {params.get('welcome') && <Alert kind="success">{t('account.welcome')}</Alert>}
      {!user.emailVerified && <VerifyBanner />}

      <Card
        title={t('account.seller.title')}
        description={t(user.sellerProfile ? 'account.seller.has' : 'account.seller.none')}
      >
        <Link
          to="/account/seller"
          className="inline-block rounded-lg bg-brand-700 px-4 py-2 text-sm font-medium text-white hover:bg-brand-800"
        >
          {t(user.sellerProfile ? 'account.seller.edit' : 'account.seller.create')}
        </Link>
      </Card>

      <ProfileForm user={user} />
      <PasswordForm />
      <PhoneSharing user={user} />
      <TwoStepSettings user={user} />
      <EmailPreferences user={user} />
      <DataAndDeletion />
    </div>
  );
}
