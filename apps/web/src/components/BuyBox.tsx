import {
  convertMoney,
  formatMoney,
  placeOrderSchema,
  roundMoney,
  type CurrencyCode,
  type DeliveryMethod,
  type ListingDetail,
} from '@tzed/shared';
import { useState, type FormEvent, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation, useNavigate } from 'react-router';
import { useMe } from '../lib/auth';
import { apiErrors, validate, type FieldErrors } from '../lib/forms';
import { useAddToCart } from '../lib/cart';
import { usePlaceOrder } from '../lib/orders';
import { useZmwTzsRate } from '../lib/rates';
import { useDaysLabel } from '../lib/delivery';
import { CustomsNotice } from './CustomsNotice';
import { Alert } from './Form';

/** Delivery options a buyer in `buyerCountry` can choose (mirrors the API rules). */
export function deliveryOptionsFor(listing: ListingDetail, buyerCountry: string): DeliveryMethod[] {
  const same = listing.countryCode === buyerCountry;
  return [
    ...(listing.deliveryPickup ? (['PICKUP'] as const) : []),
    ...(listing.deliveryLocal && same ? (['LOCAL'] as const) : []),
    ...(listing.crossBorder && !same ? (['CROSS_BORDER'] as const) : []),
  ];
}

export function BuyBox({ listing }: { listing: ListingDetail }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const { data: me, isPending } = useMe();
  const { data: rate } = useZmwTzsRate();
  const place = usePlaceOrder();
  const addToCart = useAddToCart();
  const [quantity, setQuantity] = useState(1);
  const [method, setMethod] = useState<DeliveryMethod | ''>('');
  const [note, setNote] = useState('');
  const [customs, setCustoms] = useState(false);
  const daysLabel = useDaysLabel();
  const [errors, setErrors] = useState<FieldErrors>({});

  if (isPending || listing.isOwner) return null;
  const box = (children: ReactNode) => (
    <section
      className="rounded-xl border border-brand-100 bg-white p-4 shadow-sm"
      aria-label={t('buy.title')}
    >
      {children}
    </section>
  );

  if (listing.status !== 'ACTIVE')
    return box(<p className="text-sm text-stone-600">{t('buy.notAvailable')}</p>);
  if (!me) {
    const next = encodeURIComponent(location.pathname);
    return box(
      <div className="space-y-3">
        <p className="text-sm text-stone-600">{t('buy.signInToOrder')}</p>
        <Link
          to={`/login?next=${next}`}
          className="block rounded-lg bg-brand-700 px-4 py-2.5 text-center font-medium text-white hover:bg-brand-800"
        >
          {t('buy.signIn')}
        </Link>
      </div>,
    );
  }

  const available =
    listing.countryCode === me.countryCode || listing.shipTo.includes(me.countryCode);
  if (!available) {
    return box(
      <p className="text-sm text-stone-600">
        {t('buy.notInYourCountry', { country: t(`countries.${me.countryCode}`) })}
      </p>,
    );
  }
  if (!me.emailVerified) return box(<Alert kind="info">{t('buy.verifyFirst')}</Alert>);

  const options = deliveryOptionsFor(listing, me.countryCode);
  const buyerCurrency: CurrencyCode = me.currency;
  const total = roundMoney(listing.price * quantity, listing.currency);
  const converted =
    buyerCurrency !== listing.currency && rate
      ? convertMoney(total, listing.currency, buyerCurrency, rate)
      : null;
  const otherCountry = listing.countryCode === 'TZ' ? 'ZM' : 'TZ';
  const daysFor = (m: DeliveryMethod) =>
    m === 'LOCAL'
      ? daysLabel(listing.localDays)
      : m === 'CROSS_BORDER'
        ? daysLabel(listing.crossBorderDays)
        : null;

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const values = {
      listingId: listing.id,
      quantity,
      deliveryMethod: method,
      buyerNote: note,
      acceptCustoms: customs,
    };
    const { errors } = validate(placeOrderSchema, values);
    const customsMissing = method === 'CROSS_BORDER' && !customs;
    setErrors({
      ...(errors ?? {}),
      ...(customsMissing ? { acceptCustoms: t('delivery.customsRequired') } : {}),
    });
    if (errors || customsMissing) return;
    place.mutate(values as Parameters<typeof place.mutate>[0], {
      onSuccess: (d) => navigate(`/orders/${d.order.id}?placed=1`),
    });
  }

  const server = apiErrors(place.error);
  const cartError = apiErrors(addToCart.error).message;
  return box(
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      <h2 className="font-semibold">{t('buy.title')}</h2>
      {server.message && <Alert>{server.message}</Alert>}

      <label className="flex items-center justify-between gap-3 text-sm">
        <span className="font-medium">{t('buy.quantity')}</span>
        <select
          value={quantity}
          onChange={(e) => setQuantity(Number(e.target.value))}
          className="rounded-lg border border-stone-300 bg-white px-2 py-1.5"
        >
          {Array.from({ length: Math.min(listing.quantity, 20) }, (_, i) => i + 1).map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </label>

      <fieldset>
        <legend className="mb-1.5 text-sm font-medium">{t('buy.delivery')}</legend>
        <div className="space-y-1.5">
          {options.map((o) => (
            <label
              key={o}
              className="flex cursor-pointer items-start gap-2 rounded-lg border border-stone-200 px-3 py-2 text-sm has-[:checked]:border-brand-600 has-[:checked]:bg-brand-50"
            >
              <input
                type="radio"
                name="delivery"
                value={o}
                checked={method === o}
                onChange={() => {
                  setMethod(o);
                  setErrors(({ deliveryMethod: _d, ...rest }) => rest);
                }}
                className="mt-0.5 accent-brand-700"
              />
              <span>
                {t(`buy.method.${o}`, {
                  town: listing.town,
                  country: t(`countries.${me.countryCode}`),
                  from: t(`countries.${otherCountry}`),
                })}
                {daysFor(o) && (
                  <span className="block text-stone-600">
                    {t('delivery.usuallyTakes', { days: daysFor(o) })}
                  </span>
                )}
              </span>
            </label>
          ))}
        </div>
        {(errors.deliveryMethod ?? server.fields.deliveryMethod) && (
          <p className="mt-1 text-sm text-red-700">
            {errors.deliveryMethod ?? server.fields.deliveryMethod}
          </p>
        )}
      </fieldset>

      {method === 'CROSS_BORDER' && (
        <CustomsNotice
          checked={customs}
          onChange={(v) => {
            setCustoms(v);
            if (v) setErrors(({ acceptCustoms: _c, ...rest }) => rest);
          }}
          error={errors.acceptCustoms ?? server.fields.acceptCustoms}
          from={t(`countries.${listing.countryCode}`)}
          to={t(`countries.${me.countryCode}`)}
        />
      )}

      <label className="block text-sm">
        <span className="mb-1 block font-medium">{t('buy.note')}</span>
        <textarea
          rows={2}
          maxLength={500}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={t('buy.notePlaceholder')}
          className="block w-full rounded-lg border border-stone-300 px-3 py-2"
        />
      </label>

      <div className="rounded-lg bg-stone-50 px-3 py-2 text-sm">
        <div className="flex justify-between font-semibold">
          <span>{t('buy.total')}</span>
          <span className="tabular-nums">{formatMoney(total, listing.currency)}</span>
        </div>
        {converted !== null && (
          <div className="flex justify-between text-stone-600">
            <span>{t('buy.inYourCurrency')}</span>
            <span className="tabular-nums">≈ {formatMoney(converted, buyerCurrency)}</span>
          </div>
        )}
      </div>

      <button
        type="submit"
        disabled={place.isPending}
        className="w-full rounded-lg bg-brand-700 px-4 py-2.5 font-medium text-white hover:bg-brand-800 disabled:opacity-60"
      >
        {place.isPending ? t('buy.placing') : t('buy.place')}
      </button>
      <button
        type="button"
        disabled={addToCart.isPending}
        onClick={() => addToCart.mutate({ listingId: listing.id, quantity })}
        className="w-full rounded-lg border border-brand-700 px-4 py-2.5 font-medium text-brand-800 hover:bg-brand-50 disabled:opacity-60"
      >
        {addToCart.isPending ? t('cart.adding') : t('cart.add')}
      </button>
      <div aria-live="polite">
        {addToCart.isSuccess && !addToCart.isPending && (
          <Alert kind="success">
            {t('cart.added', { count: quantity })}{' '}
            <Link to="/cart" className="font-medium underline">
              {t('cart.view')}
            </Link>
          </Alert>
        )}
        {cartError && <Alert>{cartError}</Alert>}
      </div>
      <p className="text-xs text-stone-500">{t('buy.payOffline')}</p>
    </form>,
  );
}
