import { useMutation } from '@tanstack/react-query';
import {
  CONTACT_PREFERENCES,
  sellerProfileSchema,
  type MeResponse,
  type SellerProfileInput,
} from '@tzed/shared';
import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import {
  Alert,
  Card,
  SelectField,
  SubmitButton,
  TextareaField,
  TextField,
} from '../../components/Form';
import { put } from '../../lib/api';
import { useCountries, useMe, useSetMe } from '../../lib/auth';
import { apiErrors, validate, type FieldErrors } from '../../lib/forms';

export function SellerProfilePage() {
  const { t } = useTranslation();
  const { data: user } = useMe();
  const { data: countries } = useCountries();
  const setMe = useSetMe();
  const sp = user?.sellerProfile;
  const [values, setValues] = useState({
    shopName: sp?.shopName ?? '',
    bio: sp?.bio ?? '',
    regionId: sp?.regionId ? String(sp.regionId) : '',
    town: sp?.town ?? '',
    contactPreference: sp?.contactPreference ?? 'MESSAGES',
  });
  const [errors, setErrors] = useState<FieldErrors>({});
  const save = useMutation({
    mutationFn: (data: SellerProfileInput) => put<MeResponse>('/me/seller-profile', data),
    onSuccess: (data) => setMe(data.user),
  });

  if (!user) return null;
  const regions = countries?.find((c) => c.code === user.countryCode)?.regions ?? [];
  const regionLabel = t(
    user.countryCode === 'TZ' ? 'seller.fields.regionTZ' : 'seller.fields.regionZM',
  );

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const { errors } = validate(sellerProfileSchema, values);
    setErrors(errors ?? {});
    // Send what was typed; the API parses it with the same schema.
    if (!errors) save.mutate(values);
  }

  const server = apiErrors(save.error);
  const err = (k: string) => errors[k] ?? server.fields[k];
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <Link to="/account" className="text-sm text-brand-700 hover:underline">
          ← {t('account.title')}
        </Link>
        <h1 className="mt-2 text-2xl font-semibold">{t('seller.title')}</h1>
        <p className="mt-1 text-stone-600">
          {t('seller.intro', { country: t(`countries.${user.countryCode}`) })}
        </p>
      </div>

      <Card
        title={sp ? sp.shopName : t('seller.newShop')}
        description={sp ? t('seller.shopLink', { slug: sp.slug }) : undefined}
      >
        <form onSubmit={onSubmit} noValidate className="space-y-4">
          {server.message && <Alert>{server.message}</Alert>}
          {save.isSuccess && <Alert kind="success">{t('account.saved')}</Alert>}
          <TextField
            label={t('seller.fields.shopName')}
            value={values.shopName}
            onChange={(e) => setValues({ ...values, shopName: e.target.value })}
            error={err('shopName')}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <SelectField
              label={regionLabel}
              value={values.regionId}
              onChange={(e) => setValues({ ...values, regionId: e.target.value })}
              error={err('regionId')}
            >
              <option value="">{t('seller.fields.choose')}</option>
              {regions.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </SelectField>
            <TextField
              label={t('seller.fields.town')}
              value={values.town}
              onChange={(e) => setValues({ ...values, town: e.target.value })}
              error={err('town')}
            />
          </div>
          <SelectField
            label={t('seller.fields.contact')}
            value={values.contactPreference}
            onChange={(e) =>
              setValues({
                ...values,
                contactPreference: e.target.value as (typeof CONTACT_PREFERENCES)[number],
              })
            }
            hint={t('seller.fields.contactHint')}
          >
            {CONTACT_PREFERENCES.map((p) => (
              <option key={p} value={p}>
                {t(`seller.contact.${p}`)}
              </option>
            ))}
          </SelectField>
          <TextareaField
            label={t('seller.fields.bio')}
            rows={4}
            value={values.bio}
            onChange={(e) => setValues({ ...values, bio: e.target.value })}
            error={err('bio')}
          />
          <SubmitButton pending={save.isPending}>
            {t(sp ? 'account.save' : 'seller.create')}
          </SubmitButton>
        </form>
      </Card>
    </div>
  );
}
