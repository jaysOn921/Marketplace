import {
  CURRENCIES,
  LISTING_CONDITIONS,
  convertMoney,
  formatMoney,
  listingCreateSchema,
  parseAmount,
  type CurrencyCode,
  type ListingCondition,
  type ListingDetail,
} from '@tzed/shared';
import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import {
  Alert,
  Card,
  SelectField,
  SubmitButton,
  TextareaField,
  TextField,
} from '../../components/Form';
import { StatusBadge } from '../../components/StatusBadge';
import { useCountries, useMe } from '../../lib/auth';
import { apiErrors, validate, type FieldErrors } from '../../lib/forms';
import {
  useCategories,
  useCreateListing,
  useDeleteListing,
  useListing,
  useListingAction,
  useUpdateListing,
} from '../../lib/listings';
import { useZmwTzsRate } from '../../lib/rates';
import { PhotoManager } from './PhotoManager';
import { useCategoryName } from '../../lib/categoryName';

type Values = {
  title: string;
  description: string;
  categoryId: string;
  condition: string;
  price: string;
  quantity: string;
  regionId: string;
  town: string;
  deliveryPickup: boolean;
  deliveryLocal: boolean;
  crossBorder: boolean;
  deliveryNotes: string;
};

function initialValues(
  listing: ListingDetail | undefined,
  defaults: { regionId?: number | null; town?: string | null },
): Values {
  return {
    title: listing?.title ?? '',
    description: listing?.description ?? '',
    categoryId: listing ? String(listing.categoryId) : '',
    condition: listing?.condition ?? '',
    price: listing ? String(listing.price) : '',
    quantity: listing ? String(listing.quantity) : '1',
    regionId: listing
      ? String(listing.regionId)
      : defaults.regionId
        ? String(defaults.regionId)
        : '',
    town: listing?.town ?? defaults.town ?? '',
    deliveryPickup: listing?.deliveryPickup ?? true,
    deliveryLocal: listing?.deliveryLocal ?? false,
    crossBorder: listing?.crossBorder ?? false,
    deliveryNotes: listing?.deliveryNotes ?? '',
  };
}

function Checkbox({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  hint?: string;
}) {
  return (
    <label className="flex items-start gap-2.5 text-sm">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 rounded border-stone-300 accent-brand-700"
      />
      <span>
        <span className="font-medium text-stone-800">{label}</span>
        {hint && <span className="block text-stone-500">{hint}</span>}
      </span>
    </label>
  );
}

function ListingForm({ listing }: { listing?: ListingDetail }) {
  const { t } = useTranslation();
  const catName = useCategoryName();
  const navigate = useNavigate();
  const { data: user } = useMe();
  const { data: countries } = useCountries();
  const { data: categories } = useCategories();
  const { data: rate } = useZmwTzsRate();
  const create = useCreateListing();
  const update = useUpdateListing(listing?.id ?? 0);
  const [values, setValues] = useState<Values>(() =>
    initialValues(listing, {
      regionId: user?.sellerProfile?.regionId,
      town: user?.sellerProfile?.town,
    }),
  );
  const [errors, setErrors] = useState<FieldErrors>({});
  const [notice, setNotice] = useState<{ kind: 'success' | 'info'; text: string } | null>(null);

  if (!user) return null;
  const countryCode = listing?.countryCode ?? user.countryCode;
  const currency: CurrencyCode = listing?.currency ?? user.currency;
  const otherCountry = countryCode === 'TZ' ? 'ZM' : 'TZ';
  const otherCurrency: CurrencyCode = currency === 'TZS' ? 'ZMW' : 'TZS';
  const regions = countries?.find((c) => c.code === countryCode)?.regions ?? [];
  const priceNumber = parseAmount(values.price);
  const set = <K extends keyof Values>(k: K, v: Values[K]) => {
    setValues((s) => ({ ...s, [k]: v }));
    // Clear a field's error as soon as it's edited (delivery errors sit on the first checkbox).
    const key = k === 'deliveryLocal' || k === 'crossBorder' ? 'deliveryPickup' : k;
    setErrors(({ [key]: _cleared, ...rest }) => rest);
  };
  const mutation = listing ? update : create;

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setNotice(null);
    const payload = {
      ...values,
      condition: values.condition as ListingCondition,
      price: values.price.replace(/[\s,]/g, ''),
    };
    const { errors } = validate(listingCreateSchema, payload);
    setErrors(errors ?? {});
    if (errors) return;
    if (listing) {
      update.mutate(payload, {
        onSuccess: (d) =>
          setNotice(
            d.sentForReview
              ? { kind: 'info', text: t('listingForm.sentForReview') }
              : { kind: 'success', text: t('account.saved') },
          ),
      });
    } else {
      create.mutate(payload, {
        onSuccess: (d) => navigate(`/listings/${d.listing.id}/edit?created=1`, { replace: true }),
      });
    }
  }

  const server = apiErrors(mutation.error);
  const err = (k: string) => errors[k] ?? server.fields[k];
  const regionLabel = t(countryCode === 'TZ' ? 'seller.fields.regionTZ' : 'seller.fields.regionZM');

  return (
    <Card title={t('listingForm.details')}>
      <form onSubmit={onSubmit} noValidate className="space-y-5">
        {server.message && <Alert>{server.message}</Alert>}
        {notice && <Alert kind={notice.kind}>{notice.text}</Alert>}

        <TextField
          label={t('listingForm.fields.title')}
          value={values.title}
          maxLength={120}
          onChange={(e) => set('title', e.target.value)}
          error={err('title')}
          hint={t('listingForm.hints.title')}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField
            label={t('listingForm.fields.category')}
            value={values.categoryId}
            onChange={(e) => set('categoryId', e.target.value)}
            error={err('categoryId')}
          >
            <option value="">{t('seller.fields.choose')}</option>
            {categories?.map((c) =>
              c.children.length ? (
                <optgroup key={c.id} label={catName(c)}>
                  {c.children.map((child) => (
                    <option key={child.id} value={child.id}>
                      {catName(child)}
                    </option>
                  ))}
                </optgroup>
              ) : (
                <option key={c.id} value={c.id}>
                  {catName(c)}
                </option>
              ),
            )}
          </SelectField>
          <SelectField
            label={t('listingForm.fields.condition')}
            value={values.condition}
            onChange={(e) => set('condition', e.target.value)}
            error={err('condition')}
          >
            <option value="">{t('seller.fields.choose')}</option>
            {LISTING_CONDITIONS.map((c) => (
              <option key={c} value={c}>
                {t(`condition.${c}`)}
              </option>
            ))}
          </SelectField>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label={t('listingForm.fields.price', { currency })}
            inputMode="decimal"
            value={values.price}
            onChange={(e) => set('price', e.target.value)}
            error={err('price')}
            hint={
              priceNumber && rate
                ? t('listingForm.hints.priceConverted', {
                    price: formatMoney(priceNumber, currency),
                    converted: formatMoney(
                      convertMoney(priceNumber, currency, otherCurrency, rate),
                      otherCurrency,
                    ),
                  })
                : t('listingForm.hints.price', { symbol: CURRENCIES[currency].symbol })
            }
          />
          <TextField
            label={t('listingForm.fields.quantity')}
            type="number"
            min={1}
            max={999}
            value={values.quantity}
            onChange={(e) => set('quantity', e.target.value)}
            error={err('quantity')}
          />
        </div>

        <TextareaField
          label={t('listingForm.fields.description')}
          rows={6}
          maxLength={5000}
          value={values.description}
          onChange={(e) => set('description', e.target.value)}
          error={err('description')}
          hint={t('listingForm.hints.description')}
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField
            label={regionLabel}
            value={values.regionId}
            onChange={(e) => set('regionId', e.target.value)}
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
            onChange={(e) => set('town', e.target.value)}
            error={err('town')}
          />
        </div>

        <fieldset className="space-y-3 rounded-lg border border-stone-200 p-4">
          <legend className="px-1 text-sm font-semibold text-stone-800">
            {t('listingForm.delivery.title')}
          </legend>
          <Checkbox
            checked={values.deliveryPickup}
            onChange={(v) => set('deliveryPickup', v)}
            label={t('listingForm.delivery.pickup')}
          />
          <Checkbox
            checked={values.deliveryLocal}
            onChange={(v) => set('deliveryLocal', v)}
            label={t('listingForm.delivery.local')}
          />
          <Checkbox
            checked={values.crossBorder}
            onChange={(v) => set('crossBorder', v)}
            label={t('listingForm.delivery.crossBorder', {
              country: t(`countries.${otherCountry}`),
            })}
            hint={t('listingForm.delivery.crossBorderHint')}
          />
          {err('deliveryPickup') && <p className="text-sm text-red-700">{err('deliveryPickup')}</p>}
          <TextareaField
            label={t('listingForm.fields.deliveryNotes')}
            rows={2}
            maxLength={500}
            value={values.deliveryNotes}
            onChange={(e) => set('deliveryNotes', e.target.value)}
            error={err('deliveryNotes')}
            hint={t('listingForm.hints.deliveryNotes')}
          />
        </fieldset>

        <SubmitButton pending={mutation.isPending}>
          {listing ? t('account.save') : t('listingForm.createDraft')}
        </SubmitButton>
      </form>
    </Card>
  );
}

function ReviewPanel({ listing }: { listing: ListingDetail }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const action = useListingAction(listing.id);
  const remove = useDeleteListing(listing.id);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const error = apiErrors(action.error ?? remove.error).message;
  const canSubmit = listing.status === 'DRAFT' || listing.status === 'REJECTED';

  return (
    <Card title={t('listingForm.status.title')}>
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <StatusBadge status={listing.status} />
          {listing.status !== 'DRAFT' && (
            <Link to={`/listings/${listing.id}`} className="text-sm text-brand-700 hover:underline">
              {t('listingForm.status.view')}
            </Link>
          )}
        </div>
        <p className="text-sm text-stone-600">
          {t(`listingForm.status.explain.${listing.status}`)}
        </p>
        {listing.status === 'REJECTED' && listing.rejectionReason && (
          <Alert>
            <span className="font-medium">{t('listingForm.status.reason')}</span>{' '}
            {listing.rejectionReason}
          </Alert>
        )}
        {error && <Alert>{error}</Alert>}
        <div className="flex flex-wrap gap-3">
          {canSubmit && (
            <button
              type="button"
              disabled={action.isPending || listing.images.length === 0}
              onClick={() => action.mutate('submit')}
              className="rounded-lg bg-brand-700 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-800 disabled:opacity-50"
            >
              {t(
                listing.status === 'REJECTED'
                  ? 'listingForm.status.resubmit'
                  : 'listingForm.status.submit',
              )}
            </button>
          )}
          {listing.status === 'ACTIVE' && (
            <button
              type="button"
              onClick={() => action.mutate('mark-sold')}
              className="rounded-lg border border-stone-300 px-4 py-2.5 text-sm font-medium hover:bg-stone-50"
            >
              {t('listingForm.status.markSold')}
            </button>
          )}
          {listing.status === 'SOLD' && (
            <button
              type="button"
              onClick={() => action.mutate('mark-available')}
              className="rounded-lg border border-stone-300 px-4 py-2.5 text-sm font-medium hover:bg-stone-50"
            >
              {t('listingForm.status.markAvailable')}
            </button>
          )}
          {!confirmDelete ? (
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              className="rounded-lg px-4 py-2.5 text-sm font-medium text-red-700 hover:bg-red-50"
            >
              {t('listingForm.status.delete')}
            </button>
          ) : (
            <span className="flex items-center gap-2 text-sm">
              {t('listingForm.status.confirmDelete')}
              <button
                type="button"
                onClick={() =>
                  remove.mutate(undefined, {
                    onSuccess: () => navigate('/account/listings', { replace: true }),
                  })
                }
                className="rounded-lg bg-red-700 px-3 py-2 font-medium text-white hover:bg-red-800"
              >
                {t('listingForm.status.deleteYes')}
              </button>
              <button
                type="button"
                onClick={() => setConfirmDelete(false)}
                className="rounded-lg px-3 py-2 hover:bg-stone-100"
              >
                {t('common.cancel')}
              </button>
            </span>
          )}
        </div>
        {canSubmit && listing.images.length === 0 && (
          <p className="text-sm text-amber-800">{t('listingForm.status.needPhoto')}</p>
        )}
      </div>
    </Card>
  );
}

/** Explains what's missing before someone can sell (email, seller profile). */
function SellerGate() {
  const { t } = useTranslation();
  const { data: user } = useMe();
  if (!user) return null;
  if (!user.emailVerified) return <Alert kind="info">{t('sell.verifyFirst')}</Alert>;
  if (!user.sellerProfile)
    return (
      <Alert kind="info">
        {t('sell.profileFirst')}{' '}
        <Link to="/account/seller" className="font-medium underline">
          {t('account.seller.create')}
        </Link>
      </Alert>
    );
  return null;
}

export function NewListingPage() {
  const { t } = useTranslation();
  const { data: user } = useMe();
  const ready = user?.emailVerified && user.sellerProfile;
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{t('listingForm.newTitle')}</h1>
        <p className="mt-1 text-stone-600">{t('listingForm.newIntro')}</p>
      </div>
      {ready ? <ListingForm /> : <SellerGate />}
    </div>
  );
}

export function EditListingPage() {
  const { t } = useTranslation();
  const id = Number(useParams().id);
  const [params] = useSearchParams();
  const { data: listing, isPending, error } = useListing(id);
  const [reviewNotice, setReviewNotice] = useState(false);

  if (isPending) return <p className="text-stone-500">{t('common.loading')}</p>;
  if (error || !listing) return <Alert>{apiErrors(error).message ?? t('listing.notFound')}</Alert>;
  if (!listing.isOwner) return <Alert>{t('listing.notYours')}</Alert>;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Link to="/account/listings" className="text-sm text-brand-700 hover:underline">
          ← {t('myListings.title')}
        </Link>
        <h1 className="mt-2 text-2xl font-semibold">{listing.title}</h1>
      </div>
      {params.get('created') && listing.images.length === 0 && (
        <Alert kind="success">{t('listingForm.created')}</Alert>
      )}
      {listing.status === 'ACTIVE' && <Alert kind="info">{t('listingForm.liveWarning')}</Alert>}
      {reviewNotice && <Alert kind="info">{t('listingForm.sentForReview')}</Alert>}
      <PhotoManager listing={listing} onSentForReview={() => setReviewNotice(true)} />
      <ReviewPanel listing={listing} />
      <ListingForm listing={listing} />
    </div>
  );
}
